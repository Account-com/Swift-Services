from __future__ import annotations

import hashlib
import hmac
import html
import json
import logging
import os
import threading
import time
from datetime import datetime
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org/bot"
TELEGRAM_TIMEOUT_SECONDS = 10
TELEGRAM_WEBHOOK_PATH = "/api/telegram/webhook"
CALLBACK_ACTION_PREFIX = "mpa"
CALLBACK_SIGNATURE_LENGTH = 16
_WEBHOOK_CONFIGURED_URL: str | None = None
_POLLING_THREAD: threading.Thread | None = None
_POLLING_LOCK = threading.Lock()

TELEGRAM_COLUMNS = {
    "telegram_message_id",
    "telegram_notified_at",
    "telegram_notification_status",
    "telegram_notification_error",
    "telegram_approved_notified_at",
    "telegram_cancel_notified_at",
    "telegram_last_update_at",
}


def _now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat()


def _bot_token() -> str:
    return os.getenv("TELEGRAM_BOT_TOKEN", "").strip()


def _admin_chat_id() -> str:
    return os.getenv("TELEGRAM_ADMIN_CHAT_ID", "").strip()


def _webhook_secret_token() -> str:
    return os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()


def telegram_is_configured() -> bool:
    return bool(_bot_token() and _admin_chat_id())


def _callback_secret() -> str:
    return _bot_token() or os.getenv("SECRET_KEY", "").strip()


def telegram_webhook_url() -> str:
    explicit = os.getenv("TELEGRAM_WEBHOOK_URL", "").strip()
    if explicit:
        return explicit

    base = os.getenv("BASE_PUBLIC_URL", "").strip().rstrip("/")
    if not base or "your-domain.example.com" in base:
        return ""
    return f"{base}{TELEGRAM_WEBHOOK_PATH}"


def is_valid_telegram_webhook_request(headers: Any) -> bool:
    expected = _webhook_secret_token()
    if not expected:
        return True
    received = str(headers.get("X-Telegram-Bot-Api-Secret-Token") or "").strip()
    return hmac.compare_digest(received, expected)


def configure_telegram_webhook(*, drop_pending_updates: bool = False) -> dict[str, Any]:
    if not telegram_is_configured():
        raise RuntimeError("TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is missing.")

    url = telegram_webhook_url()
    if not url:
        raise RuntimeError("TELEGRAM_WEBHOOK_URL or a real BASE_PUBLIC_URL is required for Telegram buttons.")

    payload: dict[str, Any] = {
        "url": url,
        "allowed_updates": ["callback_query"],
        "drop_pending_updates": bool(drop_pending_updates),
    }
    secret_token = _webhook_secret_token()
    if secret_token:
        payload["secret_token"] = secret_token

    result = _telegram_api("setWebhook", payload)
    return {"url": url, "configured": bool(result)}


def get_telegram_webhook_info() -> dict[str, Any]:
    if not _bot_token():
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured.")
    result = _telegram_api("getWebhookInfo", {})
    return dict(result) if isinstance(result, dict) else {}


def ensure_telegram_webhook_registered() -> tuple[bool, str | None]:
    global _WEBHOOK_CONFIGURED_URL

    if not telegram_is_configured():
        return False, "TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is missing."

    url = telegram_webhook_url()
    if not url:
        return False, "TELEGRAM_WEBHOOK_URL or a real BASE_PUBLIC_URL is required for Telegram buttons."

    if _WEBHOOK_CONFIGURED_URL == url:
        return True, None

    try:
        configure_telegram_webhook(drop_pending_updates=False)
        _WEBHOOK_CONFIGURED_URL = url
        return True, None
    except Exception as exc:
        logger.exception("Failed to configure Telegram webhook for manual payment callbacks.")
        return False, str(exc)


def _html(value: Any) -> str:
    text = str(value if value is not None else "").strip()
    return html.escape(text or "Not available", quote=False)


def _optional(value: Any, fallback: str = "Not available") -> str:
    text = str(value if value is not None else "").strip()
    return text or fallback


def _money(amount: Any, currency: str = "GHS") -> str:
    try:
        parsed = float(amount or 0)
    except (TypeError, ValueError):
        parsed = 0.0
    return f"{currency} {parsed:,.2f}"


def _payment_dict(payment: dict[str, Any] | Any) -> dict[str, Any]:
    return dict(payment or {})


def _payment_reference(payment: dict[str, Any]) -> str:
    return str(payment.get("reference") or "").strip()


def _status_label(payment: dict[str, Any]) -> str:
    status = str(payment.get("status") or "pending").strip().lower()
    failure_reason = str(payment.get("failure_reason") or "").strip().lower()
    cancellation_reason = str(payment.get("cancellation_reason") or "").strip().lower()

    if status == "approved":
        return "Approved"
    if status in {"cancelled", "canceled"}:
        if failure_reason == "expired" or cancellation_reason in {"timeout_expired", "expired"}:
            return "Cancelled (timeout)"
        return "Cancelled"
    if status == "failed" and failure_reason == "expired":
        return "Cancelled (timeout)"
    if status == "pending":
        return "Pending approval"
    return status.replace("_", " ").title() or "Pending approval"


def _payment_type_label(payment_type: Any) -> str:
    raw = str(payment_type or "").strip().lower()
    labels = {
        "level_unlock": "Level unlock",
        "final_stage_unlock": "Final-stage unlock",
    }
    return labels.get(raw, raw.replace("_", " ").title() or "Manual payment")


def _proof_value(payment: dict[str, Any]) -> str:
    for key in ("proof_url", "proof_path", "proof_of_payment", "evidence_url", "receipt_url", "attachment_url"):
        value = str(payment.get(key) or "").strip()
        if value:
            return value
    return "None attached"


def _note_value(payment: dict[str, Any]) -> str:
    for key in ("note", "comment", "user_note", "user_comment", "payer_note"):
        value = str(payment.get(key) or "").strip()
        if value:
            return value
    return "None provided"


def _absolute_url(path: Any) -> str:
    value = str(path or "").strip()
    if not value:
        return ""
    if value.startswith(("http://", "https://")):
        return value
    base = os.getenv("BASE_PUBLIC_URL", "").strip().rstrip("/")
    if base and value.startswith("/"):
        return f"{base}{value}"
    return value


def _manual_payment_defaults() -> dict[str, str]:
    try:
        from services.manual_payment_service import ACCOUNT_NAME, ACCOUNT_NUMBER, NETWORK

        return {
            "account_name": ACCOUNT_NAME,
            "account_number": ACCOUNT_NUMBER,
            "network": NETWORK,
        }
    except Exception:
        return {
            "account_name": "DANIEL ADOMAKO",
            "account_number": "0545098694",
            "network": "MTN",
        }


def _line(label: str, value: Any) -> str:
    return f"<b>{html.escape(label, quote=False)}:</b> {_html(value)}"


def _status_emoji(payment: dict[str, Any]) -> str:
    status = str(payment.get("status") or "pending").strip().lower()
    if status == "approved":
        return "✅"
    if status in {"cancelled", "canceled", "failed"}:
        return "⛔"
    return "⏳"


def _unlock_level_label(payment: dict[str, Any]) -> str:
    level = payment.get("level_number") if payment.get("level_number") is not None else payment.get("level_id")
    if level in (None, ""):
        return "Not available"

    payment_type = str(payment.get("payment_type") or "").strip().lower()
    if payment_type == "final_stage_unlock":
        return f"Level {level} final stage"
    return f"Level {level}"


def _event_heading(event: str, payment: dict[str, Any]) -> tuple[str, str]:
    status = _status_label(payment)
    headings = {
        "submitted": ("💎 <b>MANUAL PAYMENT VERIFICATION</b>", "🚨 New payment waiting for admin approval"),
        "approved": ("✅ <b>MANUAL PAYMENT APPROVED</b>", "🎯 Dashboard status has been updated"),
        "cancelled": ("⛔ <b>MANUAL PAYMENT CANCELLED</b>", "🕒 This payment is no longer pending"),
        "handled": ("⚠️ <b>PAYMENT ALREADY HANDLED</b>", f"{_status_emoji(payment)} Current status: {html.escape(status, quote=False)}"),
    }
    return headings.get(event, headings["submitted"])


def format_manual_payment_message(payment: dict[str, Any] | Any, *, event: str = "submitted") -> str:
    item = _payment_dict(payment)
    currency = str(item.get("currency") or "GHS").strip() or "GHS"
    account_number = item.get("account_number") or item.get("payer_account_number") or item.get("phone_number")
    account_name = item.get("account_name") or item.get("payer_account_name")
    heading, subtitle = _event_heading(event, item)

    lines = [
        heading,
        subtitle,
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "👤 <b>USER DETAILS</b>",
        _line("🆔 USER ID", item.get("user_id")),
        _line("🙋 FULL NAME", item.get("full_name")),
        _line("📧 EMAIL", item.get("email")),
        "",
        "🏦 <b>PAYMENT ACCOUNT</b>",
        _line("📱 ACCOUNT NUMBER", account_number),
        _line("🏷️ ACCOUNT NAME", account_name),
        "",
        "💰 <b>VERIFICATION SUMMARY</b>",
        _line("💵 AMOUNT", _money(item.get("amount"), currency)),
        _line("🧾 PAYMENT TYPE", _payment_type_label(item.get("payment_type"))),
        _line("🔓 INTENDED UNLOCK LEVEL", _unlock_level_label(item)),
        "━━━━━━━━━━━━━━━━━━━━",
    ]

    if item.get("telegram_action_warning"):
        lines.extend(
            [
                "",
                "⚠️ <b>ACTION WARNING</b>",
                _line("Callback status", item.get("telegram_action_warning")),
            ]
        )

    if event in {"approved", "cancelled", "handled"}:
        lines.extend(
            [
                "",
                _line(f"{_status_emoji(item)} STATUS", _status_label(item)),
            ]
        )
    if event == "approved" and item.get("approved_at"):
        lines.append(_line("🕘 APPROVED AT", item.get("approved_at")))
    if event == "cancelled" and (item.get("cancelled_at") or item.get("expired_at")):
        lines.append(_line("🕘 STOPPED AT", item.get("cancelled_at") or item.get("expired_at")))
    if event == "submitted":
        lines.extend(
            [
                "",
                "👇 <b>Tap Approve only after confirming the payment.</b>",
            ]
        )

    return "\n".join(lines)


def _telegram_api(
    method: str,
    payload: dict[str, Any],
    *,
    request_timeout: int = TELEGRAM_TIMEOUT_SECONDS,
) -> dict[str, Any] | list[Any] | bool:
    token = _bot_token()
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured.")

    url = f"{TELEGRAM_API_BASE}{token}/{method}"
    data = json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=request_timeout) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Telegram API HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise RuntimeError(f"Telegram API request failed: {exc.reason}") from exc

    parsed = json.loads(raw or "{}")
    if not parsed.get("ok"):
        raise RuntimeError(parsed.get("description") or "Telegram API returned an error.")
    return parsed.get("result")


def delete_telegram_webhook(*, drop_pending_updates: bool = False) -> bool:
    if not _bot_token():
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured.")
    result = _telegram_api("deleteWebhook", {"drop_pending_updates": bool(drop_pending_updates)})
    return bool(result)


def get_telegram_updates(offset: int | None = None, *, timeout: int = 25) -> list[dict[str, Any]]:
    payload: dict[str, Any] = {
        "timeout": timeout,
        "allowed_updates": ["callback_query"],
    }
    if offset is not None:
        payload["offset"] = offset

    result = _telegram_api("getUpdates", payload, request_timeout=timeout + 5)
    return [dict(item) for item in result] if isinstance(result, list) else []


def _polling_mode() -> str:
    return os.getenv("TELEGRAM_POLLING_ENABLED", "auto").strip().lower()


def telegram_polling_should_start() -> bool:
    if not telegram_is_configured():
        return False

    mode = _polling_mode()
    if mode in {"0", "false", "no", "off", "disabled"}:
        return False
    if mode in {"1", "true", "yes", "on", "enabled"}:
        return True

    return not bool(telegram_webhook_url())


def start_telegram_callback_polling(
    callback_handler: Callable[[dict[str, Any]], Any],
) -> bool:
    global _POLLING_THREAD

    if not telegram_polling_should_start():
        return False

    with _POLLING_LOCK:
        if _POLLING_THREAD and _POLLING_THREAD.is_alive():
            return True

        def _poll() -> None:
            offset: int | None = None
            webhook_deleted = False
            logger.info("Telegram callback polling started.")

            while True:
                try:
                    if not webhook_deleted:
                        delete_telegram_webhook(drop_pending_updates=False)
                        webhook_deleted = True

                    for update in get_telegram_updates(offset=offset):
                        update_id = update.get("update_id")
                        if isinstance(update_id, int):
                            offset = update_id + 1

                        callback_query = update.get("callback_query") or {}
                        if not callback_query:
                            continue
                        callback_handler(callback_query)
                except Exception:
                    logger.exception("Telegram callback polling cycle failed.")
                    time.sleep(5)

        _POLLING_THREAD = threading.Thread(
            target=_poll,
            name="telegram-callback-polling",
            daemon=True,
        )
        _POLLING_THREAD.start()
        return True


def send_telegram_admin_message(
    text: str,
    *,
    reply_markup: dict[str, Any] | None = None,
    disable_web_page_preview: bool = True,
) -> dict[str, Any] | None:
    if not telegram_is_configured():
        logger.info("Telegram notification skipped because bot token or admin chat ID is missing.")
        return None

    payload: dict[str, Any] = {
        "chat_id": _admin_chat_id(),
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": disable_web_page_preview,
    }
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup

    result = _telegram_api("sendMessage", payload)
    return dict(result) if isinstance(result, dict) else None


def answer_telegram_callback(callback_query_id: str, text: str, *, show_alert: bool = False) -> None:
    if not callback_query_id or not _bot_token():
        return
    try:
        _telegram_api(
            "answerCallbackQuery",
            {
                "callback_query_id": callback_query_id,
                "text": text[:200],
                "show_alert": show_alert,
            },
        )
    except Exception:
        logger.exception("Failed to answer Telegram callback query.")


def _existing_manual_payment_columns(conn: Any) -> set[str]:
    try:
        rows = conn.execute("PRAGMA table_info(manual_payments)").fetchall()
    except Exception:
        return set()
    return {row["name"] for row in rows}


def _update_manual_payment_telegram_fields(
    conn: Any,
    reference: str,
    fields: dict[str, Any],
) -> None:
    clean_reference = str(reference or "").strip()
    if not clean_reference:
        return

    existing = _existing_manual_payment_columns(conn)
    allowed_fields = {
        key: value
        for key, value in fields.items()
        if key in TELEGRAM_COLUMNS and key in existing
    }
    if not allowed_fields:
        return

    assignments = ", ".join(f"{column} = ?" for column in allowed_fields)
    values = list(allowed_fields.values())
    values.append(clean_reference)
    conn.execute(
        f"UPDATE manual_payments SET {assignments} WHERE reference = ?",
        tuple(values),
    )
    conn.commit()


def _record_telegram_status(
    conn: Any,
    payment: dict[str, Any],
    *,
    status: str,
    error: str | None = None,
    extra_fields: dict[str, Any] | None = None,
) -> None:
    fields = {
        "telegram_notification_status": status,
        "telegram_notification_error": (error or "")[:500] if error else None,
        "telegram_last_update_at": _now_iso(),
    }
    fields.update(extra_fields or {})
    _update_manual_payment_telegram_fields(conn, _payment_reference(payment), fields)


def _fresh_manual_payment(conn: Any, payment: dict[str, Any]) -> dict[str, Any]:
    reference = _payment_reference(payment)
    if not reference:
        return payment
    try:
        row = conn.execute(
            """
            SELECT *
            FROM manual_payments
            WHERE reference = ?
            """,
            (reference,),
        ).fetchone()
    except Exception:
        return payment
    if not row:
        return payment
    refreshed = dict(row)
    for key, value in payment.items():
        if key not in refreshed or refreshed.get(key) in (None, ""):
            refreshed[key] = value
    return refreshed


def build_manual_payment_approve_callback_data(payment: dict[str, Any] | Any) -> str | None:
    item = _payment_dict(payment)
    payment_id = str(item.get("id") or "").strip()
    secret = _callback_secret()
    if not payment_id or not payment_id.isdigit() or not secret:
        return None

    message = f"manual_payment:approve:{payment_id}"
    signature = hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:CALLBACK_SIGNATURE_LENGTH]
    return f"{CALLBACK_ACTION_PREFIX}:{payment_id}:{signature}"


def parse_manual_payment_approve_callback_data(data: str) -> int | None:
    parts = str(data or "").split(":")
    if len(parts) != 3 or parts[0] != CALLBACK_ACTION_PREFIX:
        return None

    payment_id = parts[1].strip()
    signature = parts[2].strip()
    if not payment_id.isdigit() or len(signature) != CALLBACK_SIGNATURE_LENGTH:
        return None

    expected = build_manual_payment_approve_callback_data({"id": payment_id})
    if not expected:
        return None
    expected_signature = expected.rsplit(":", 1)[-1]
    if not hmac.compare_digest(signature, expected_signature):
        return None
    return int(payment_id)


def is_authorized_telegram_callback(callback_query: dict[str, Any]) -> bool:
    expected = _admin_chat_id()
    if not expected:
        return False

    from_user = callback_query.get("from") or {}
    message = callback_query.get("message") or {}
    chat = message.get("chat") or {}

    from_id = str(from_user.get("id") or "").strip()
    chat_id = str(chat.get("id") or "").strip()
    chat_type = str(chat.get("type") or "").strip().lower()

    if from_id == expected:
        return True
    return chat_type == "private" and chat_id == expected


def telegram_callback_actor(callback_query: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    from_user = callback_query.get("from") or {}
    message = callback_query.get("message") or {}
    chat = message.get("chat") or {}
    from_id = str(from_user.get("id") or "").strip()
    chat_id = str(chat.get("id") or "").strip()
    actor_id = f"telegram:{from_id or chat_id or 'admin'}"
    metadata = {
        "telegram_from_id": from_id,
        "telegram_chat_id": chat_id,
        "telegram_username": from_user.get("username"),
        "telegram_first_name": from_user.get("first_name"),
        "telegram_last_name": from_user.get("last_name"),
        "telegram_message_id": message.get("message_id"),
        "telegram_callback_id": callback_query.get("id"),
    }
    return actor_id, metadata


def _approve_reply_markup(payment: dict[str, Any]) -> dict[str, Any] | None:
    callback_data = build_manual_payment_approve_callback_data(payment)
    if not callback_data:
        return None
    return {
        "inline_keyboard": [
            [
                {
                    "text": "✅ Approve",
                    "callback_data": callback_data,
                }
            ]
        ]
    }


def _edit_original_manual_payment_message(conn: Any, payment: dict[str, Any], *, event: str) -> None:
    message_id = str(payment.get("telegram_message_id") or "").strip()
    if not message_id or not telegram_is_configured():
        return

    try:
        _telegram_api(
            "editMessageText",
            {
                "chat_id": _admin_chat_id(),
                "message_id": message_id,
                "text": format_manual_payment_message(payment, event=event),
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
                "reply_markup": {"inline_keyboard": []},
            },
        )
    except Exception:
        logger.exception("Failed to edit Telegram manual payment message.")
        _record_telegram_status(
            conn,
            payment,
            status="edit_failed",
            error="Failed to edit original Telegram payment message.",
        )


def notify_manual_payment_submitted(conn: Any, payment: dict[str, Any] | Any) -> bool:
    item = _fresh_manual_payment(conn, _payment_dict(payment))
    if item.get("telegram_message_id"):
        return False

    if not telegram_is_configured():
        _record_telegram_status(
            conn,
            item,
            status="disabled",
            error="TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is missing.",
        )
        return False

    webhook_ready = True
    webhook_error = None
    if not telegram_polling_should_start():
        webhook_ready, webhook_error = ensure_telegram_webhook_registered()
        if webhook_error:
            item["telegram_action_warning"] = webhook_error

    reply_markup = _approve_reply_markup(item)
    if not reply_markup:
        _record_telegram_status(
            conn,
            item,
            status="failed",
            error="Could not build Telegram approve callback data.",
        )
        return False

    try:
        result = send_telegram_admin_message(
            format_manual_payment_message(item, event="submitted"),
            reply_markup=reply_markup,
        )
        message_id = str((result or {}).get("message_id") or "")
        _record_telegram_status(
            conn,
            item,
            status="sent" if webhook_ready else "sent_callback_unverified",
            error=webhook_error,
            extra_fields={
                "telegram_message_id": message_id or None,
                "telegram_notified_at": _now_iso(),
            },
        )
        return True
    except Exception as exc:
        logger.exception("Failed to send Telegram manual payment notification.")
        _record_telegram_status(conn, item, status="failed", error=str(exc))
        return False


def notify_manual_payment_approved(conn: Any, payment: dict[str, Any] | Any) -> bool:
    item = _fresh_manual_payment(conn, _payment_dict(payment))
    if item.get("telegram_approved_notified_at"):
        return False

    if not telegram_is_configured():
        _record_telegram_status(
            conn,
            item,
            status="disabled",
            error="TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is missing.",
        )
        return False

    try:
        send_telegram_admin_message(format_manual_payment_message(item, event="approved"))
        _edit_original_manual_payment_message(conn, item, event="approved")
        _record_telegram_status(
            conn,
            item,
            status="approved_notified",
            extra_fields={"telegram_approved_notified_at": _now_iso()},
        )
        return True
    except Exception as exc:
        logger.exception("Failed to send Telegram manual payment approval notification.")
        _record_telegram_status(conn, item, status="approval_notify_failed", error=str(exc))
        return False


def notify_manual_payment_cancelled(conn: Any, payment: dict[str, Any] | Any) -> bool:
    item = _fresh_manual_payment(conn, _payment_dict(payment))
    if item.get("telegram_cancel_notified_at"):
        return False

    if not telegram_is_configured():
        _record_telegram_status(
            conn,
            item,
            status="disabled",
            error="TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is missing.",
        )
        return False

    try:
        send_telegram_admin_message(format_manual_payment_message(item, event="cancelled"))
        _edit_original_manual_payment_message(conn, item, event="cancelled")
        _record_telegram_status(
            conn,
            item,
            status="cancelled_notified",
            extra_fields={"telegram_cancel_notified_at": _now_iso()},
        )
        return True
    except Exception as exc:
        logger.exception("Failed to send Telegram manual payment cancellation notification.")
        _record_telegram_status(conn, item, status="cancel_notify_failed", error=str(exc))
        return False
