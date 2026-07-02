import json
import secrets
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from config import (
    PAYMENT_CURRENCY,
    PAYMENT_PROVIDER,
    PAYSTACK_ALLOWED_CHANNELS,
    PAYSTACK_CALLBACK_URL,
    PAYSTACK_PUBLIC_KEY,
    PAYSTACK_SECRET_KEY,
    PAYSTACK_SUBUNIT_MULTIPLIER,
)
from services.db_service import fetch_one, now_iso
from services.level_service import (
    get_level_by_id,
    get_user_level,
    mark_final_stage_unlocked,
    mark_level_unlocked,
)
from utils.enums import PaymentStatus, PaymentType, UserLevelStatus

PAYSTACK_BASE_URL = "https://api.paystack.co"


def _ensure_paystack_keys() -> None:
    if not PAYSTACK_SECRET_KEY:
        raise ValueError("Missing Paystack secret key in environment.")
    if not PAYSTACK_PUBLIC_KEY:
        raise ValueError("Missing Paystack public key in environment.")


def _request_json(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _ensure_paystack_keys()

    url = f"{PAYSTACK_BASE_URL}{path}"
    data = None
    headers = {
        "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
    }

    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    print("PAYSTACK REQUEST URL:", url)
    print("PAYSTACK REQUEST METHOD:", method.upper())
    print("PAYSTACK REQUEST PAYLOAD:", payload)

    req = urllib.request.Request(
        url=url,
        data=data,
        headers=headers,
        method=method.upper(),
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8")
            print("PAYSTACK RESPONSE STATUS:", response.status)
            print("PAYSTACK RESPONSE BODY:", body)
            return json.loads(body)

    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        print("PAYSTACK HTTP ERROR STATUS:", exc.code)
        print("PAYSTACK HTTP ERROR BODY:", body)

        try:
            parsed = json.loads(body)
            return {
                "status": False,
                "message": parsed.get("message", f"HTTP Error {exc.code}"),
                "raw": parsed,
            }
        except Exception:
            return {
                "status": False,
                "message": f"HTTP Error {exc.code}: {exc.reason}",
                "raw": body,
            }

    except Exception as exc:
        print("PAYSTACK REQUEST EXCEPTION:", str(exc))
        return {
            "status": False,
            "message": str(exc),
            "raw": None,
        }


def get_payment_config() -> dict[str, Any]:
    _ensure_paystack_keys()
    return {
        "provider": PAYMENT_PROVIDER,
        "currency": PAYMENT_CURRENCY,
        "public_key": PAYSTACK_PUBLIC_KEY,
        "channels": PAYSTACK_ALLOWED_CHANNELS,
        "checkout_mode": "hosted_checkout",
    }


def save_user_email(
    conn: sqlite3.Connection,
    user_id: str,
    email: str,
) -> None:
    clean_email = (email or "").strip().lower()
    if not clean_email:
        return

    conn.execute(
        """
        UPDATE users
        SET email = ?
        WHERE user_id = ?
        """,
        (clean_email, user_id),
    )
    conn.commit()


def get_user_email(
    conn: sqlite3.Connection,
    user_id: str,
) -> str | None:
    row = fetch_one(
        conn,
        """
        SELECT email
        FROM users
        WHERE user_id = ?
        """,
        (user_id,),
    )
    if not row:
        return None
    return (row.get("email") or "").strip().lower() or None


def _make_reference(
    user_id: str,
    level_number: int,
    payment_type: str,
) -> str:
    prefix = "LVL" if payment_type == PaymentType.LEVEL_UNLOCK.value else "FNL"
    random_part = secrets.token_hex(4)
    return f"{prefix}_{user_id}_{level_number}_{int(time.time() * 1000)}_{random_part}"


def _amount_to_subunit(amount: float) -> int:
    return int(round(float(amount) * PAYSTACK_SUBUNIT_MULTIPLIER))


def initialize_paystack_transaction(
    *,
    email: str,
    amount: float,
    reference: str,
    callback_url: str | None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    clean_email = (email or "").strip().lower()
    if not clean_email:
        raise ValueError("Email is required to initialize payment.")

    payload: dict[str, Any] = {
        "email": clean_email,
        "amount": str(_amount_to_subunit(amount)),
        "currency": PAYMENT_CURRENCY,
        "reference": reference,
    }

    clean_callback = (callback_url or PAYSTACK_CALLBACK_URL or "").strip()
    if clean_callback:
        payload["callback_url"] = clean_callback

    if metadata is not None:
        payload["metadata"] = metadata

    if PAYSTACK_ALLOWED_CHANNELS:
        payload["channels"] = PAYSTACK_ALLOWED_CHANNELS

    return _request_json("POST", "/transaction/initialize", payload)


def verify_paystack_transaction(reference: str) -> dict[str, Any]:
    safe_reference = urllib.parse.quote(reference, safe="")
    return _request_json("GET", f"/transaction/verify/{safe_reference}")


def _insert_payment_intent(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    level_id: int,
    payment_type: str,
    amount: float,
    reference: str,
    provider_access_code: str | None,
    provider_response_raw: dict[str, Any],
    status: str,
) -> dict[str, Any]:
    timestamp = now_iso()

    conn.execute(
        """
        INSERT INTO payment_intents (
            user_id,
            level_id,
            payment_type,
            amount,
            currency,
            reference,
            provider,
            provider_access_code,
            status,
            provider_response_raw,
            verified_at,
            expires_at,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            level_id,
            payment_type,
            float(amount),
            PAYMENT_CURRENCY,
            reference,
            PAYMENT_PROVIDER,
            provider_access_code,
            status,
            json.dumps(provider_response_raw),
            None,
            None,
            timestamp,
            timestamp,
        ),
    )
    conn.commit()

    row = fetch_one(
        conn,
        """
        SELECT *
        FROM payment_intents
        WHERE reference = ?
        """,
        (reference,),
    )
    if not row:
        raise ValueError("Failed to create payment intent.")
    return row


def initialize_level_unlock_payment(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    level_id: int,
    email: str | None = None,
    callback_url: str | None = None,
) -> dict[str, Any]:
    level = get_level_by_id(conn, level_id)
    if not level:
        raise ValueError("Level not found.")

    user_level = get_user_level(conn, user_id, level_id)
    if user_level and user_level["status"] != UserLevelStatus.LOCKED.value:
        raise ValueError("This level is already unlocked or completed.")

    effective_email = (email or get_user_email(conn, user_id) or "").strip().lower()
    if not effective_email:
        raise ValueError("Email is required to initialize payment.")

    save_user_email(conn, user_id, effective_email)

    reference = _make_reference(
        user_id=user_id,
        level_number=int(level["level_number"]),
        payment_type=PaymentType.LEVEL_UNLOCK.value,
    )

    metadata = {
        "user_id": user_id,
        "level_id": level_id,
        "level_number": int(level["level_number"]),
        "payment_type": PaymentType.LEVEL_UNLOCK.value,
    }

    response = initialize_paystack_transaction(
        email=effective_email,
        amount=float(level["unlock_fee"]),
        reference=reference,
        callback_url=callback_url,
        metadata=metadata,
    )

    if not response.get("status"):
        raise ValueError(response.get("message", "Paystack initialization failed."))

    data = response.get("data") or {}

    intent = _insert_payment_intent(
        conn,
        user_id=user_id,
        level_id=level_id,
        payment_type=PaymentType.LEVEL_UNLOCK.value,
        amount=float(level["unlock_fee"]),
        reference=reference,
        provider_access_code=data.get("access_code"),
        provider_response_raw=response,
        status=PaymentStatus.PENDING.value,
    )

    return {
        "payment_intent": intent,
        "authorization_url": data.get("authorization_url"),
        "access_code": data.get("access_code"),
        "reference": data.get("reference") or reference,
        "amount": float(level["unlock_fee"]),
        "level_number": int(level["level_number"]),
        "public_key": PAYSTACK_PUBLIC_KEY,
        "payment_status": data.get("status"),
        "payment_channel": data.get("channel"),
    }


def initialize_final_stage_payment(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    level_id: int,
    email: str | None = None,
    callback_url: str | None = None,
) -> dict[str, Any]:
    level = get_level_by_id(conn, level_id)
    if not level:
        raise ValueError("Level not found.")

    if int(level["final_stage_enabled"] or 0) != 1:
        raise ValueError("This level does not support final-stage unlock.")

    user_level = get_user_level(conn, user_id, level_id)
    if not user_level:
        raise ValueError("You have not unlocked this level yet.")

    if user_level["status"] != UserLevelStatus.ACTIVE_FINAL_STAGE_PENDING.value:
        raise ValueError("Final stage is not available for payment yet.")

    effective_email = (email or get_user_email(conn, user_id) or "").strip().lower()
    if not effective_email:
        raise ValueError("Email is required to initialize payment.")

    save_user_email(conn, user_id, effective_email)

    reference = _make_reference(
        user_id=user_id,
        level_number=int(level["level_number"]),
        payment_type=PaymentType.FINAL_STAGE_UNLOCK.value,
    )

    metadata = {
        "user_id": user_id,
        "level_id": level_id,
        "level_number": int(level["level_number"]),
        "payment_type": PaymentType.FINAL_STAGE_UNLOCK.value,
    }

    response = initialize_paystack_transaction(
        email=effective_email,
        amount=float(level["final_stage_fee"]),
        reference=reference,
        callback_url=callback_url,
        metadata=metadata,
    )

    if not response.get("status"):
        raise ValueError(response.get("message", "Paystack initialization failed."))

    data = response.get("data") or {}

    intent = _insert_payment_intent(
        conn,
        user_id=user_id,
        level_id=level_id,
        payment_type=PaymentType.FINAL_STAGE_UNLOCK.value,
        amount=float(level["final_stage_fee"]),
        reference=reference,
        provider_access_code=data.get("access_code"),
        provider_response_raw=response,
        status=PaymentStatus.PENDING.value,
    )

    return {
        "payment_intent": intent,
        "authorization_url": data.get("authorization_url"),
        "access_code": data.get("access_code"),
        "reference": data.get("reference") or reference,
        "amount": float(level["final_stage_fee"]),
        "level_number": int(level["level_number"]),
        "public_key": PAYSTACK_PUBLIC_KEY,
        "payment_status": data.get("status"),
        "payment_channel": data.get("channel"),
    }


def _update_payment_intent_status(
    conn: sqlite3.Connection,
    *,
    reference: str,
    status: str,
    provider_response_raw: dict[str, Any],
    verified_at: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE payment_intents
        SET
            status = ?,
            provider_response_raw = ?,
            verified_at = COALESCE(?, verified_at),
            updated_at = ?
        WHERE reference = ?
        """,
        (
            status,
            json.dumps(provider_response_raw),
            verified_at,
            now_iso(),
            reference,
        ),
    )
    conn.commit()


def verify_and_apply_payment(
    conn: sqlite3.Connection,
    reference: str,
) -> dict[str, Any]:
    intent = fetch_one(
        conn,
        """
        SELECT *
        FROM payment_intents
        WHERE reference = ?
        """,
        (reference,),
    )
    if not intent:
        raise ValueError("Payment intent not found.")

    if intent["status"] == PaymentStatus.SUCCESS.value:
        return {
            "success": True,
            "message": "Payment already verified.",
            "reference": reference,
            "payment_type": intent["payment_type"],
            "level_id": intent["level_id"],
            "already_verified": True,
        }

    verification = verify_paystack_transaction(reference)
    if not verification.get("status"):
        _update_payment_intent_status(
            conn,
            reference=reference,
            status=PaymentStatus.FAILED.value,
            provider_response_raw=verification,
        )
        raise ValueError(verification.get("message", "Payment verification failed."))

    data = verification.get("data") or {}
    paystack_status = (data.get("status") or "").strip().lower()

    if paystack_status != "success":
        mapped_status = {
            "abandoned": PaymentStatus.ABANDONED.value,
            "failed": PaymentStatus.FAILED.value,
        }.get(paystack_status, PaymentStatus.PENDING.value)

        _update_payment_intent_status(
            conn,
            reference=reference,
            status=mapped_status,
            provider_response_raw=verification,
        )

        failure_reason = (
            data.get("message")
            or data.get("gateway_response")
            or f"Payment is not successful yet. Current status: {paystack_status or 'unknown'}"
        )

        return {
            "success": False,
            "message": failure_reason,
            "reference": reference,
            "payment_status": mapped_status,
        }

    verified_amount = float(data.get("amount", 0)) / float(PAYSTACK_SUBUNIT_MULTIPLIER)
    stored_amount = float(intent["amount"] or 0)

    if round(verified_amount, 2) != round(stored_amount, 2):
        _update_payment_intent_status(
            conn,
            reference=reference,
            status=PaymentStatus.FAILED.value,
            provider_response_raw=verification,
        )
        raise ValueError("Verified amount does not match expected payment amount.")

    timestamp = now_iso()
    _update_payment_intent_status(
        conn,
        reference=reference,
        status=PaymentStatus.SUCCESS.value,
        provider_response_raw=verification,
        verified_at=timestamp,
    )

    if intent["payment_type"] == PaymentType.LEVEL_UNLOCK.value:
        user_level = mark_level_unlocked(conn, intent["user_id"], int(intent["level_id"]))
        return {
            "success": True,
            "message": "Level unlock payment verified successfully.",
            "reference": reference,
            "payment_type": intent["payment_type"],
            "level_id": int(intent["level_id"]),
            "user_level": user_level,
            "payment_status": PaymentStatus.SUCCESS.value,
        }

    if intent["payment_type"] == PaymentType.FINAL_STAGE_UNLOCK.value:
        user_level = mark_final_stage_unlocked(conn, intent["user_id"], int(intent["level_id"]))
        return {
            "success": True,
            "message": "Final-stage payment verified successfully.",
            "reference": reference,
            "payment_type": intent["payment_type"],
            "level_id": int(intent["level_id"]),
            "user_level": user_level,
            "payment_status": PaymentStatus.SUCCESS.value,
        }

    raise ValueError("Unsupported payment type.")