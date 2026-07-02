from __future__ import annotations

import sqlite3
from typing import Any

from services.manual_payment_service import (
    ACCOUNT_NAME as MERCHANT_ACCOUNT_NAME,
    ACCOUNT_NUMBER as MERCHANT_ACCOUNT_NUMBER,
    NETWORK as MANUAL_PAYMENT_NETWORK,
    ensure_manual_payments_table,
    expire_pending_manual_payments,
)


SUCCESS_STATUSES = {"success", "successful", "verified", "completed", "approved", "credited"}
PENDING_STATUSES = {"held", "pending", "initialized", "processing", "under_review", "review"}
FAILED_STATUSES = {"failed", "rejected", "amount_mismatch", "mismatch", "expired", "abandoned", "declined"}
CANCELLED_STATUSES = {"cancelled", "canceled"}


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return bool(row)


def _status_group(status: str | None, *, verified_at: str | None = None) -> str:
    raw = str(status or "").strip().lower()
    if raw in CANCELLED_STATUSES:
        return "cancelled"
    if verified_at or raw in SUCCESS_STATUSES:
        return "successful"
    if raw in FAILED_STATUSES:
        return "failed"
    if raw in PENDING_STATUSES:
        return "pending"
    return raw or "pending"


def _amount(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _payment_type_label(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    if raw == "final_stage_unlock":
        return "Final stage unlock"
    if raw == "level_unlock":
        return "Level unlock"
    if raw == "deposit":
        return "Deposit"
    return raw.replace("_", " ").title() if raw else "Deposit"


def _sort_key(item: dict[str, Any]) -> str:
    return str(item.get("created_at") or item.get("updated_at") or "")


def _payment_intent_rows(conn: sqlite3.Connection, user_id: str) -> list[dict[str, Any]]:
    if not _table_exists(conn, "payment_intents"):
        return []

    if _table_exists(conn, "level_catalog"):
        rows = conn.execute(
            """
            SELECT pi.*, lc.level_number
            FROM payment_intents pi
            LEFT JOIN level_catalog lc ON lc.id = pi.level_id
            WHERE pi.user_id = ?
            ORDER BY pi.created_at DESC, pi.id DESC
            """,
            (user_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT *
            FROM payment_intents
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (user_id,),
        ).fetchall()

    transactions = []
    for row in rows:
        item = dict(row)
        raw_status = str(item.get("status") or "pending").strip().lower()
        amount = _amount(item.get("amount"))
        payment_type = item.get("payment_type") or "level_unlock"
        transactions.append(
            {
                "id": f"pi_{item.get('id')}",
                "reference": item.get("reference"),
                "transaction_id": item.get("reference"),
                "amount": amount,
                "currency": item.get("currency") or "GHS",
                "status": raw_status,
                "status_group": _status_group(raw_status, verified_at=item.get("verified_at")),
                "payment_method": item.get("provider") or "paystack",
                "provider": item.get("provider") or "paystack",
                "payment_mode": "automatic",
                "is_manual": False,
                "is_automatic": True,
                "payment_type": payment_type,
                "payment_type_label": _payment_type_label(payment_type),
                "level_id": item.get("level_id"),
                "level_number": item.get("level_number") if item.get("level_number") is not None else item.get("level_id"),
                "intended_level": item.get("level_number") if item.get("level_number") is not None else item.get("level_id"),
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
                "verified_at": item.get("verified_at"),
                "expires_at": item.get("expires_at"),
                "provider_access_code": item.get("provider_access_code"),
                "raw_response": item.get("provider_response_raw"),
                "can_cancel": False,
                "live_status_url": None,
                "source": "payment_intent",
            }
        )
    return transactions


def _manual_payment_rows(conn: sqlite3.Connection, user_id: str) -> list[dict[str, Any]]:
    ensure_manual_payments_table(conn)
    expire_pending_manual_payments(conn)

    rows = conn.execute(
        """
        SELECT *
        FROM manual_payments
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (user_id,),
    ).fetchall()

    transactions = []
    for row in rows:
        item = dict(row)
        raw_status = str(item.get("status") or "pending").strip().lower()
        amount = _amount(item.get("amount"))
        payment_type = item.get("payment_type") or "level_unlock"
        account_number = item.get("account_number") or item.get("phone_number") or ""
        account_name = item.get("account_name") or ""
        reference = item.get("reference")
        transactions.append(
            {
                "id": f"mp_{item.get('id')}",
                "reference": reference,
                "transaction_id": reference,
                "amount": amount,
                "currency": "GHS",
                "status": raw_status,
                "status_group": _status_group(raw_status, verified_at=item.get("approved_at") if raw_status == "approved" else None),
                "payment_method": item.get("payment_method") or "manual",
                "provider": "manual",
                "payment_mode": "manual",
                "is_manual": True,
                "is_automatic": False,
                "network_type": item.get("network_type") or MANUAL_PAYMENT_NETWORK,
                "account_number": account_number,
                "account_name": account_name,
                "payer_account_number": account_number,
                "payer_account_name": account_name,
                "phone_number": item.get("phone_number") or account_number,
                "merchant_account_number": MERCHANT_ACCOUNT_NUMBER,
                "merchant_account_name": MERCHANT_ACCOUNT_NAME,
                "full_name": item.get("full_name"),
                "email": item.get("email"),
                "payment_type": payment_type,
                "payment_type_label": _payment_type_label(payment_type),
                "level_id": item.get("level_id"),
                "level_number": item.get("level_number") if item.get("level_number") is not None else item.get("level_id"),
                "intended_level": item.get("level_number") if item.get("level_number") is not None else item.get("level_id"),
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
                "pending_started_at": item.get("pending_started_at") or item.get("created_at"),
                "expires_at": item.get("expires_at"),
                "approved_at": item.get("approved_at"),
                "approved_by": item.get("approved_by"),
                "failed_at": item.get("failed_at"),
                "expired_at": item.get("expired_at"),
                "failure_reason": item.get("failure_reason"),
                "cancelled_at": item.get("cancelled_at"),
                "cancelled_by": item.get("cancelled_by"),
                "cancellation_reason": item.get("cancellation_reason"),
                "can_cancel": raw_status == "pending",
                "live_status_url": f"/manual-payment-status/{reference}" if reference else None,
                "source": "manual_payment",
            }
        )
    return transactions


def _legacy_payment_rows(conn: sqlite3.Connection, user_id: str) -> list[dict[str, Any]]:
    if not _table_exists(conn, "payments"):
        return []

    rows = conn.execute(
        """
        SELECT *
        FROM payments
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (user_id,),
    ).fetchall()

    transactions = []
    for row in rows:
        item = dict(row)
        raw_status = str(item.get("status") or "initialized").strip().lower()
        amount = _amount(item.get("amount_ghs"))
        reference = item.get("reference")
        transactions.append(
            {
                "id": f"pay_{item.get('id')}",
                "reference": reference,
                "transaction_id": reference,
                "amount": amount,
                "currency": item.get("currency") or "GHS",
                "status": raw_status,
                "status_group": _status_group(raw_status, verified_at=item.get("credited_at")),
                "payment_method": item.get("provider") or "paystack",
                "provider": item.get("provider") or "paystack",
                "payment_mode": "automatic",
                "is_manual": False,
                "is_automatic": True,
                "payment_type": "deposit",
                "payment_type_label": "Deposit",
                "level_id": None,
                "level_number": None,
                "intended_level": None,
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
                "verified_at": item.get("credited_at") or item.get("paid_at"),
                "paid_at": item.get("paid_at"),
                "credited_at": item.get("credited_at"),
                "gateway_response": item.get("gateway_response"),
                "channel": item.get("channel"),
                "raw_response": item.get("raw_response"),
                "can_cancel": False,
                "live_status_url": None,
                "source": "legacy_payment",
            }
        )
    return transactions


def get_user_payment_history(conn: sqlite3.Connection, user_id: str) -> list[dict[str, Any]]:
    transactions = []
    seen_refs: set[str] = set()

    for source_rows in (
        _payment_intent_rows(conn, user_id),
        _manual_payment_rows(conn, user_id),
        _legacy_payment_rows(conn, user_id),
    ):
        for item in source_rows:
            ref = str(item.get("reference") or "")
            if ref and ref in seen_refs:
                continue
            if ref:
                seen_refs.add(ref)
            transactions.append(item)

    transactions.sort(key=_sort_key, reverse=True)
    return transactions
