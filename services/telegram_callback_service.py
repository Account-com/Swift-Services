from __future__ import annotations

import logging
from typing import Any

from services.db_service import get_connection
from services.manual_payment_service import approve_manual_payment, get_manual_payment_by_id
from services.telegram_service import (
    answer_telegram_callback,
    format_manual_payment_message,
    is_authorized_telegram_callback,
    notify_manual_payment_approved,
    parse_manual_payment_approve_callback_data,
    send_telegram_admin_message,
    telegram_callback_actor,
)


logger = logging.getLogger(__name__)


def _handled_payment_message(payment: dict[str, Any]) -> str:
    status = str(payment.get("status") or "unknown").strip().lower()
    failure_reason = str(payment.get("failure_reason") or "").strip().lower()
    cancellation_reason = str(payment.get("cancellation_reason") or "").strip().lower()

    if status in {"cancelled", "canceled"}:
        if failure_reason == "expired" or cancellation_reason in {"timeout_expired", "expired"}:
            return "Payment is already cancelled by the 10-minute timeout."
        return "Payment is already cancelled."
    if status == "approved":
        return "Payment is already approved."
    return f"Payment already handled. Current status: {status}."


def process_manual_payment_approval_callback(callback_query: dict[str, Any]) -> dict[str, Any]:
    callback_query_id = str(callback_query.get("id") or "")
    callback_data = str(callback_query.get("data") or "")
    payment_id = parse_manual_payment_approve_callback_data(callback_data)

    if payment_id is None:
        answer_telegram_callback(callback_query_id, "Invalid or expired payment action.", show_alert=True)
        logger.warning(
            "Rejected malformed Telegram manual payment callback data=%r",
            callback_data,
        )
        return {"ok": False, "reason": "invalid_callback_data"}

    if not is_authorized_telegram_callback(callback_query):
        answer_telegram_callback(
            callback_query_id,
            "You are not authorized to approve this payment.",
            show_alert=True,
        )
        logger.warning(
            "Rejected unauthorized Telegram manual payment callback for payment_id=%s",
            payment_id,
        )
        return {"ok": False, "reason": "unauthorized", "payment_id": payment_id}

    actor_id, actor_metadata = telegram_callback_actor(callback_query)

    try:
        with get_connection() as conn:
            payment = get_manual_payment_by_id(conn, payment_id)
            if str(payment.get("status") or "").strip().lower() != "pending":
                message = _handled_payment_message(payment)
                answer_telegram_callback(callback_query_id, message, show_alert=True)
                try:
                    send_telegram_admin_message(format_manual_payment_message(payment, event="handled"))
                except Exception:
                    logger.exception("Failed to send Telegram already-handled payment notice.")
                return {
                    "ok": False,
                    "reason": "not_pending",
                    "payment_id": payment_id,
                    "status": payment.get("status"),
                }

            approved_payment = approve_manual_payment(
                conn,
                reference=payment["reference"],
                approved_by=actor_id,
                approval_source="telegram",
                reason="approved_from_telegram",
                metadata=actor_metadata,
            )
            answer_telegram_callback(
                callback_query_id,
                "✅ Payment approved. Dashboard updated.",
                show_alert=True,
            )
            notify_manual_payment_approved(conn, approved_payment)
            return {
                "ok": True,
                "reason": "approved",
                "payment_id": payment_id,
                "reference": approved_payment.get("reference"),
            }
    except ValueError as exc:
        answer_telegram_callback(callback_query_id, str(exc), show_alert=True)
        return {"ok": False, "reason": "validation_error", "payment_id": payment_id, "error": str(exc)}
    except Exception as exc:
        logger.exception("Telegram manual payment approval failed.")
        answer_telegram_callback(
            callback_query_id,
            "Could not approve this payment safely. Check the dashboard.",
            show_alert=True,
        )
        return {"ok": False, "reason": "system_error", "payment_id": payment_id, "error": str(exc)}
