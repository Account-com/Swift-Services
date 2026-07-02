from __future__ import annotations

import secrets
import sqlite3
import time
import json
import logging
from datetime import datetime, timedelta
from typing import Any

from services.level_service import (
    get_level_by_id,
    get_user_level,
    mark_final_stage_unlocked,
    mark_level_unlocked,
)
from utils.enums import PaymentType, UserLevelStatus

ACCOUNT_NUMBER = "0545098694"
ACCOUNT_NAME = "DANIEL ADOMAKO"
NETWORK = "MTN"
PAYMENT_METHOD = "manual"
MANUAL_PAYMENT_WINDOW_MINUTES = 10
logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.utcnow()


def _iso(value: datetime | None = None) -> str:
    return (value or _utcnow()).replace(microsecond=0).isoformat()


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)


def _add_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    if not _column_exists(conn, table, column):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return bool(row)


def _log_manual_audit(
    conn: sqlite3.Connection,
    *,
    action_type: str,
    target_id: str,
    summary: str,
    actor_type: str = "system",
    actor_id: str = "system",
    metadata: dict[str, Any] | None = None,
    created_at: str | None = None,
) -> None:
    if not _table_exists(conn, "audit_logs"):
        return

    conn.execute(
        """
        INSERT INTO audit_logs (
            actor_type,
            actor_id,
            action_group,
            action_type,
            target_type,
            target_id,
            summary,
            reason,
            metadata_json,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            actor_type,
            actor_id,
            "payment",
            action_type,
            "manual_payment",
            target_id,
            summary,
            None,
            json.dumps(metadata or {}),
            created_at or _iso(),
        ),
    )


def ensure_manual_payments_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS manual_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT UNIQUE,
            user_id TEXT,
            full_name TEXT,
            email TEXT,
            amount REAL,
            payment_method TEXT,
            network_type TEXT,
            phone_number TEXT,
            account_number TEXT,
            account_name TEXT,
            level_id INTEGER,
            level_number INTEGER,
            payment_type TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT,
            updated_at TEXT,
            pending_started_at TEXT,
            expires_at TEXT,
            approved_at TEXT,
            approved_by TEXT,
            failed_at TEXT,
            expired_at TEXT,
            expired_by TEXT,
            failure_reason TEXT,
            cancelled_at TEXT,
            cancelled_by TEXT,
            cancellation_reason TEXT,
            approval_source TEXT,
            admin_action_metadata TEXT,
            telegram_message_id TEXT,
            telegram_notified_at TEXT,
            telegram_notification_status TEXT,
            telegram_notification_error TEXT,
            telegram_approved_notified_at TEXT,
            telegram_cancel_notified_at TEXT,
            telegram_last_update_at TEXT
        )
        """
    )

    columns = {
        "reference": "TEXT",
        "user_id": "TEXT",
        "full_name": "TEXT",
        "email": "TEXT",
        "amount": "REAL",
        "payment_method": "TEXT",
        "network_type": "TEXT",
        "phone_number": "TEXT",
        "account_number": "TEXT",
        "account_name": "TEXT",
        "level_id": "INTEGER",
        "level_number": "INTEGER",
        "payment_type": "TEXT",
        "status": "TEXT DEFAULT 'pending'",
        "created_at": "TEXT",
        "updated_at": "TEXT",
        "pending_started_at": "TEXT",
        "expires_at": "TEXT",
        "approved_at": "TEXT",
        "approved_by": "TEXT",
        "failed_at": "TEXT",
        "expired_at": "TEXT",
        "expired_by": "TEXT",
        "failure_reason": "TEXT",
        "cancelled_at": "TEXT",
        "cancelled_by": "TEXT",
        "cancellation_reason": "TEXT",
        "approval_source": "TEXT",
        "admin_action_metadata": "TEXT",
        "telegram_message_id": "TEXT",
        "telegram_notified_at": "TEXT",
        "telegram_notification_status": "TEXT",
        "telegram_notification_error": "TEXT",
        "telegram_approved_notified_at": "TEXT",
        "telegram_cancel_notified_at": "TEXT",
        "telegram_last_update_at": "TEXT",
    }

    for column, definition in columns.items():
        _add_column(conn, "manual_payments", column, definition)

    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_manual_payments_reference
        ON manual_payments(reference)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_manual_payments_status
        ON manual_payments(status)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_manual_payments_user_transaction
        ON manual_payments(user_id, level_id, payment_type, status)
        """
    )
    conn.commit()


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def _clean_manual_account_name(value: str) -> str:
    text = " ".join(str(value or "").strip().split())
    if len(text) > 120:
        text = text[:120].strip()
    return text


def _clean_manual_account_number(value: str) -> str:
    return "".join(ch for ch in str(value or "").strip() if ch.isdigit())[:20]


def _get_user_display_name(conn: sqlite3.Connection, user_id: str, fallback: str = "") -> str:
    clean_fallback = " ".join(str(fallback or "").split())
    row = conn.execute(
        """
        SELECT firstname, surname, phone
        FROM users
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if not row:
        return clean_fallback or user_id

    name = " ".join(
        part for part in [row["firstname"] or "", row["surname"] or ""] if str(part).strip()
    ).strip()
    return name or clean_fallback or row["phone"] or user_id


def _save_user_email(conn: sqlite3.Connection, user_id: str, email: str) -> None:
    clean_email = (email or "").strip().lower()
    if not clean_email:
        return
    conn.execute("UPDATE users SET email = ? WHERE user_id = ?", (clean_email, user_id))


def _make_reference(user_id: str, level_number: int, payment_type: str) -> str:
    prefix = "MNL" if payment_type == PaymentType.LEVEL_UNLOCK.value else "MNF"
    random_part = secrets.token_hex(4).upper()
    safe_user = "".join(ch for ch in str(user_id or "") if ch.isalnum())[:16] or "USER"
    return f"{prefix}_{safe_user}_{level_number}_{int(time.time() * 1000)}_{random_part}"


def _manual_amount_for_payment(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    level_id: int,
    payment_type: str,
) -> tuple[dict[str, Any], float]:
    level = get_level_by_id(conn, level_id)
    if not level:
        raise ValueError("Level not found.")

    if payment_type == PaymentType.LEVEL_UNLOCK.value:
        user_level = get_user_level(conn, user_id, level_id)
        if user_level and user_level["status"] != UserLevelStatus.LOCKED.value:
            raise ValueError("This level is already unlocked or completed.")
        return level, float(level["unlock_fee"] or 0)

    if payment_type == PaymentType.FINAL_STAGE_UNLOCK.value:
        if int(level["final_stage_enabled"] or 0) != 1:
            raise ValueError("This level does not support final-stage unlock.")

        user_level = get_user_level(conn, user_id, level_id)
        if not user_level:
            raise ValueError("You have not unlocked this level yet.")
        if user_level["status"] != UserLevelStatus.ACTIVE_FINAL_STAGE_PENDING.value:
            raise ValueError("Final stage is not available for payment yet.")

        return level, float(level["final_stage_fee"] or 0)

    raise ValueError("Invalid payment type.")


def expire_pending_manual_payments(
    conn: sqlite3.Connection,
    *,
    reference: str | None = None,
) -> int:
    ensure_manual_payments_table(conn)
    timestamp = _iso()

    select_params: list[Any] = [timestamp]
    reference_clause = ""
    if reference:
        reference_clause = "AND reference = ?"
        select_params.append(reference)

    expiring_rows = conn.execute(
        f"""
        SELECT reference, user_id, amount, expires_at
        FROM manual_payments
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= ?
          {reference_clause}
        """,
        tuple(select_params),
    ).fetchall()

    if not expiring_rows:
        return 0

    update_params: list[Any] = [timestamp, timestamp, timestamp, timestamp, timestamp]
    if reference:
        update_params.append(reference)

    cur = conn.execute(
        f"""
        UPDATE manual_payments
        SET status = 'cancelled',
            failed_at = COALESCE(failed_at, ?),
            expired_at = COALESCE(expired_at, ?),
            expired_by = COALESCE(expired_by, 'system'),
            failure_reason = COALESCE(failure_reason, 'expired'),
            cancelled_at = COALESCE(cancelled_at, ?),
            cancelled_by = COALESCE(cancelled_by, 'system'),
            cancellation_reason = COALESCE(cancellation_reason, 'timeout_expired'),
            updated_at = ?
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= ?
          {reference_clause}
        """,
        tuple(update_params),
    )

    for row in expiring_rows:
        _log_manual_audit(
            conn,
            action_type="expire_manual",
            target_id=row["reference"],
            summary=f"Auto-cancelled expired manual payment {row['reference']}",
            metadata={
                "user_id": row["user_id"],
                "amount": row["amount"],
                "expired_at": timestamp,
                "cancelled_at": timestamp,
                "expires_at": row["expires_at"],
                "reason": "timeout_expired",
            },
            created_at=timestamp,
        )

    conn.commit()

    for row in expiring_rows:
        try:
            refreshed = conn.execute(
                """
                SELECT *
                FROM manual_payments
                WHERE reference = ?
                """,
                (row["reference"],),
            ).fetchone()
            if refreshed:
                from services.telegram_service import notify_manual_payment_cancelled

                notify_manual_payment_cancelled(conn, dict(refreshed))
        except Exception:
            logger.exception("Failed to notify Telegram about expired manual payment.")

    return int(cur.rowcount or 0)


def create_manual_payment(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    full_name: str = "",
    email: str = "",
    amount: float | int | str | None = None,
    level_id: int | str | None,
    payment_type: str,
    phone_number: str = "",
    network_type: str = NETWORK,
    account_number: str = "",
    account_name: str = "",
) -> dict[str, Any]:
    del amount

    ensure_manual_payments_table(conn)
    expire_pending_manual_payments(conn)

    try:
        clean_level_id = int(level_id)
    except (TypeError, ValueError):
        raise ValueError("Invalid level_id.") from None

    clean_payment_type = (payment_type or PaymentType.LEVEL_UNLOCK.value).strip()
    if clean_payment_type not in PaymentType.values():
        raise ValueError("Invalid payment type.")

    clean_network = str(network_type or "").strip().upper()
    if clean_network != NETWORK:
        raise ValueError("Manual payment fallback is only available for MTN.")

    clean_account_number = _clean_manual_account_number(account_number or phone_number)
    if not clean_account_number:
        raise ValueError("Account number used for payment is required.")

    clean_account_name = _clean_manual_account_name(account_name)
    if not clean_account_name:
        raise ValueError("Name on the account used for payment is required.")

    duplicate = conn.execute(
        """
        SELECT *
        FROM manual_payments
        WHERE user_id = ?
          AND level_id = ?
          AND payment_type = ?
          AND status = 'pending'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (str(user_id), clean_level_id, clean_payment_type),
    ).fetchone()
    if duplicate:
        raise ValueError(
            f"A manual payment is already pending for this transaction. Reference: {duplicate['reference']}"
        )

    level, expected_amount = _manual_amount_for_payment(
        conn,
        user_id=str(user_id),
        level_id=clean_level_id,
        payment_type=clean_payment_type,
    )

    clean_email = (email or "").strip().lower()
    if not clean_email:
        row = conn.execute("SELECT email FROM users WHERE user_id = ?", (str(user_id),)).fetchone()
        clean_email = ((row["email"] if row else "") or "").strip().lower()
    if not clean_email:
        raise ValueError("Email is required for manual payment.")

    clean_name = _get_user_display_name(conn, str(user_id), full_name)
    _save_user_email(conn, str(user_id), clean_email)

    created_at = _utcnow()
    expires_at = created_at + timedelta(minutes=MANUAL_PAYMENT_WINDOW_MINUTES)
    reference = _make_reference(str(user_id), int(level["level_number"]), clean_payment_type)

    conn.execute(
        """
        INSERT INTO manual_payments (
            reference,
            user_id,
            full_name,
            email,
            amount,
            payment_method,
            network_type,
            phone_number,
            account_number,
            account_name,
            level_id,
            level_number,
            payment_type,
            status,
            created_at,
            updated_at,
            pending_started_at,
            expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            str(user_id),
            clean_name,
            clean_email,
            float(expected_amount),
            PAYMENT_METHOD,
            NETWORK,
            clean_account_number,
            clean_account_number,
            clean_account_name,
            clean_level_id,
            int(level["level_number"]),
            clean_payment_type,
            "pending",
            _iso(created_at),
            _iso(created_at),
            _iso(created_at),
            _iso(expires_at),
        ),
    )
    conn.commit()

    payment = get_manual_payment(conn, reference)
    payment["created"] = True
    return payment


def get_manual_payment(conn: sqlite3.Connection, reference: str) -> dict[str, Any]:
    ensure_manual_payments_table(conn)
    clean_reference = (reference or "").strip()
    if not clean_reference:
        raise ValueError("Manual payment reference is required.")

    expire_pending_manual_payments(conn, reference=clean_reference)

    row = conn.execute(
        """
        SELECT *
        FROM manual_payments
        WHERE reference = ?
        """,
        (clean_reference,),
    ).fetchone()
    item = _row_to_dict(row)
    if not item:
        raise ValueError("Manual payment not found.")

    payer_account_number = item.get("account_number") or item.get("phone_number") or ""
    payer_account_name = item.get("account_name") or ""
    pending_started_at = item.get("pending_started_at") or item.get("created_at")
    expires_at = _parse_iso(item.get("expires_at"))
    seconds_remaining = 0
    if expires_at and item.get("status") == "pending":
        seconds_remaining = max(0, int((expires_at - _utcnow()).total_seconds()))

    item.update(
        {
            "account_number": payer_account_number,
            "account_name": payer_account_name,
            "payer_account_number": payer_account_number,
            "payer_account_name": payer_account_name,
            "merchant_account_number": ACCOUNT_NUMBER,
            "merchant_account_name": ACCOUNT_NAME,
            "network": NETWORK,
            "network_type": item.get("network_type") or NETWORK,
            "payment_method": item.get("payment_method") or PAYMENT_METHOD,
            "pending_started_at": pending_started_at,
            "seconds_remaining": seconds_remaining,
            "expired": item.get("failure_reason") == "expired",
            "level_unlocked": item.get("status") == "approved",
            "can_cancel": item.get("status") == "pending",
            "live_status_url": f"/manual-payment-status/{clean_reference}",
        }
    )
    return item


def get_manual_payment_by_id(conn: sqlite3.Connection, payment_id: int | str) -> dict[str, Any]:
    ensure_manual_payments_table(conn)
    try:
        clean_payment_id = int(payment_id)
    except (TypeError, ValueError):
        raise ValueError("Invalid manual payment ID.") from None

    row = conn.execute(
        """
        SELECT reference
        FROM manual_payments
        WHERE id = ?
        """,
        (clean_payment_id,),
    ).fetchone()
    if not row:
        raise ValueError("Manual payment not found.")

    return get_manual_payment(conn, row["reference"])


def cancel_manual_payment(
    conn: sqlite3.Connection,
    reference: str,
    *,
    user_id: str,
    cancelled_by: str = "user",
    reason: str | None = None,
) -> dict[str, Any]:
    ensure_manual_payments_table(conn)
    clean_reference = (reference or "").strip()
    if not clean_reference:
        raise ValueError("Manual payment reference is required.")

    expire_pending_manual_payments(conn, reference=clean_reference)

    row = conn.execute(
        """
        SELECT *
        FROM manual_payments
        WHERE reference = ?
        """,
        (clean_reference,),
    ).fetchone()
    if not row or str(row["user_id"]) != str(user_id):
        raise ValueError("Manual payment not found.")

    payment = dict(row)
    if payment["status"] != "pending":
        raise ValueError(f"Only pending manual payments can be cancelled. Current status: {payment['status']}.")

    timestamp = _iso()
    clean_reason = " ".join(str(reason or "").strip().split()) or "cancelled_by_user"
    cur = conn.execute(
        """
        UPDATE manual_payments
        SET status = 'cancelled',
            cancelled_at = ?,
            cancelled_by = ?,
            cancellation_reason = ?,
            updated_at = ?
        WHERE reference = ?
          AND status = 'pending'
        """,
        (timestamp, cancelled_by or "user", clean_reason, timestamp, clean_reference),
    )
    if int(cur.rowcount or 0) != 1:
        refreshed = conn.execute(
            """
            SELECT status
            FROM manual_payments
            WHERE reference = ?
            """,
            (clean_reference,),
        ).fetchone()
        status = refreshed["status"] if refreshed else "unknown"
        raise ValueError(f"Only pending manual payments can be cancelled. Current status: {status}.")

    _log_manual_audit(
        conn,
        action_type="cancel_manual",
        target_id=clean_reference,
        summary=f"Cancelled manual payment {clean_reference}",
        actor_type="user",
        actor_id=str(user_id),
        metadata={
            "user_id": user_id,
            "amount": payment.get("amount"),
            "level_id": payment.get("level_id"),
            "level_number": payment.get("level_number"),
            "payment_type": payment.get("payment_type"),
            "cancelled_at": timestamp,
            "reason": clean_reason,
        },
        created_at=timestamp,
    )
    conn.commit()

    refreshed_payment = get_manual_payment(conn, clean_reference)
    try:
        from services.telegram_service import notify_manual_payment_cancelled

        notify_manual_payment_cancelled(conn, refreshed_payment)
    except Exception:
        logger.exception("Failed to notify Telegram about cancelled manual payment.")

    return refreshed_payment


def get_admin_manual_payments(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    ensure_manual_payments_table(conn)
    expire_pending_manual_payments(conn)
    rows = conn.execute(
        """
        SELECT *
        FROM manual_payments
        ORDER BY created_at DESC, id DESC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def approve_manual_payment(
    conn: sqlite3.Connection,
    reference: str,
    approved_by: str = "admin",
    approval_source: str = "dashboard",
    reason: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ensure_manual_payments_table(conn)
    clean_reference = (reference or "").strip()
    if not clean_reference:
        raise ValueError("Manual payment reference is required.")

    expire_pending_manual_payments(conn, reference=clean_reference)

    row = conn.execute(
        """
        SELECT *
        FROM manual_payments
        WHERE reference = ?
        """,
        (clean_reference,),
    ).fetchone()
    if not row:
        raise ValueError("Manual payment not found.")

    payment = dict(row)
    if payment["status"] != "pending":
        raise ValueError("Only pending manual payments can be approved.")

    expires_at = _parse_iso(payment.get("expires_at"))
    if expires_at and _utcnow() >= expires_at:
        expire_pending_manual_payments(conn, reference=clean_reference)
        raise ValueError("This manual payment has expired.")

    _manual_amount_for_payment(
        conn,
        user_id=payment["user_id"],
        level_id=int(payment["level_id"]),
        payment_type=payment["payment_type"],
    )

    timestamp = _iso()
    clean_source = " ".join(str(approval_source or "dashboard").strip().split()) or "dashboard"
    clean_approved_by = " ".join(str(approved_by or "admin").strip().split()) or "admin"
    admin_metadata = {
        "approval_source": clean_source,
        "approved_by": clean_approved_by,
        "approved_at": timestamp,
    }
    if reason:
        admin_metadata["reason"] = reason
    if metadata:
        admin_metadata.update(metadata)

    cur = conn.execute(
        """
        UPDATE manual_payments
        SET status = 'approved',
            approved_at = ?,
            approved_by = ?,
            approval_source = ?,
            admin_action_metadata = ?,
            updated_at = ?
        WHERE reference = ?
          AND status = 'pending'
        """,
        (
            timestamp,
            clean_approved_by,
            clean_source,
            json.dumps(admin_metadata),
            timestamp,
            clean_reference,
        ),
    )
    if int(cur.rowcount or 0) != 1:
        refreshed = conn.execute(
            """
            SELECT status
            FROM manual_payments
            WHERE reference = ?
            """,
            (clean_reference,),
        ).fetchone()
        status = refreshed["status"] if refreshed else "unknown"
        raise ValueError(f"Only pending manual payments can be approved. Current status: {status}.")

    conn.commit()

    if payment["payment_type"] == PaymentType.LEVEL_UNLOCK.value:
        mark_level_unlocked(conn, payment["user_id"], int(payment["level_id"]))
    elif payment["payment_type"] == PaymentType.FINAL_STAGE_UNLOCK.value:
        mark_final_stage_unlocked(conn, payment["user_id"], int(payment["level_id"]))
    else:
        raise ValueError("Invalid manual payment type.")

    refreshed_payment = get_manual_payment(conn, clean_reference)
    actor_type = "telegram" if clean_source == "telegram" else "admin"
    _log_manual_audit(
        conn,
        action_type="approve_manual",
        target_id=clean_reference,
        summary=f"Approved manual payment {clean_reference}",
        actor_type=actor_type,
        actor_id=clean_approved_by,
        metadata={
            "user_id": payment.get("user_id"),
            "amount": payment.get("amount"),
            "level_id": payment.get("level_id"),
            "level_number": payment.get("level_number"),
            "payment_type": payment.get("payment_type"),
            "approved_at": timestamp,
            "approval_source": clean_source,
            **(metadata or {}),
        },
        created_at=timestamp,
    )
    conn.commit()

    return refreshed_payment
