from flask import Blueprint, jsonify, request

from services.db_service import get_connection
from services.manual_payment_service import cancel_manual_payment, get_manual_payment
from services.payment_history_service import get_user_payment_history
from services.paystack_service import (
    get_payment_config,
    initialize_final_stage_payment,
    initialize_level_unlock_payment,
    verify_and_apply_payment,
)
from utils.auth import json_error as auth_json_error, require_user_access

payment_bp = Blueprint("payment_bp", __name__)


def _json_error(
    message: str,
    status_code: int = 400,
    *,
    session_invalidated: bool = False,
    blocked: bool = False,
    restriction: str | None = None,
):
    return auth_json_error(
        message,
        status_code,
        session_invalidated=session_invalidated,
        blocked=blocked,
        restriction=restriction,
    )


@payment_bp.get("/api/payments/config")
def payments_config():
    try:
        config = get_payment_config()
        return jsonify({"success": True, "config": config})
    except ValueError as exc:
        return _json_error(str(exc), 500)


@payment_bp.post("/api/payments/level-unlock/init")
def payments_level_unlock_init():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("deposit", data)
    if error:
        return error

    level_id = data.get("level_id")
    contact_email = data.get("contact_email") or data.get("email")
    callback_url = data.get("callback_url")

    if not level_id:
        return _json_error("Missing level_id.")

    try:
        level_id = int(level_id)
    except Exception:
        return _json_error("Invalid level_id.")

    try:
        with get_connection() as conn:
            result = initialize_level_unlock_payment(
                conn=conn,
                user_id=user["user_id"],
                level_id=level_id,
                email=contact_email,
                callback_url=callback_url,
            )
        return jsonify({"success": True, "payment": result})
    except ValueError as exc:
        return _json_error(str(exc), 400)


@payment_bp.post("/api/payments/final-stage/init")
def payments_final_stage_init():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("deposit", data)
    if error:
        return error

    level_id = data.get("level_id")
    contact_email = data.get("contact_email") or data.get("email")
    callback_url = data.get("callback_url")

    if not level_id:
        return _json_error("Missing level_id.")

    try:
        level_id = int(level_id)
    except Exception:
        return _json_error("Invalid level_id.")

    try:
        with get_connection() as conn:
            result = initialize_final_stage_payment(
                conn=conn,
                user_id=user["user_id"],
                level_id=level_id,
                email=contact_email,
                callback_url=callback_url,
            )
        return jsonify({"success": True, "payment": result})
    except ValueError as exc:
        return _json_error(str(exc), 400)


@payment_bp.post("/api/payments/level-unlock/verify")
def payments_level_unlock_verify():
    data = request.get_json(silent=True) or {}
    reference = (data.get("reference") or "").strip()

    if not reference:
        return _json_error("Missing reference.")

    try:
        with get_connection() as conn:
            result = verify_and_apply_payment(conn, reference)
        return jsonify(result)
    except ValueError as exc:
        return _json_error(str(exc), 400)


@payment_bp.post("/api/payments/final-stage/verify")
def payments_final_stage_verify():
    data = request.get_json(silent=True) or {}
    reference = (data.get("reference") or "").strip()

    if not reference:
        return _json_error("Missing reference.")

    try:
        with get_connection() as conn:
            result = verify_and_apply_payment(conn, reference)
        return jsonify(result)
    except ValueError as exc:
        return _json_error(str(exc), 400)


@payment_bp.get("/api/payments/verify/<reference>")
def payments_verify_reference(reference: str):
    try:
        with get_connection() as conn:
            result = verify_and_apply_payment(conn, reference.strip())
        return jsonify(result)
    except ValueError as exc:
        return _json_error(str(exc), 400)


@payment_bp.get("/api/payments/history")
def payments_history():
    user, _payload, error = require_user_access()
    if error:
        return error

    with get_connection() as conn:
        transactions = get_user_payment_history(conn, user["user_id"])
    return jsonify({"success": True, "transactions": transactions})


@payment_bp.post("/api/payments/manual/init")
def payments_manual_init():
    data = request.get_json(silent=True) or {}
    _user, _payload, error = require_user_access("deposit", data)
    if error:
        return error

    return _json_error("Manual payment is currently unavailable. Please use Paystack checkout.", 410)


@payment_bp.get("/api/payments/manual/status/<reference>")
def payments_manual_status(reference: str):
    try:
        with get_connection() as conn:
            result = get_manual_payment(conn, reference)
        return jsonify({"success": True, "payment": result})
    except ValueError as exc:
        return _json_error(str(exc), 404)


@payment_bp.post("/api/payments/manual/cancel/<reference>")
def payments_manual_cancel(reference: str):
    data = request.get_json(silent=True) or {}
    user, _payload, error = require_user_access(None, data)
    if error:
        return error

    try:
        with get_connection() as conn:
            result = cancel_manual_payment(
                conn,
                reference,
                user_id=user["user_id"],
                cancelled_by=user["user_id"],
                reason=data.get("reason") or "",
            )
        return jsonify({"success": True, "payment": result})
    except ValueError as exc:
        return _json_error(str(exc), 400)
