from flask import Blueprint, jsonify, request

from services.db_service import get_connection
from services.withdrawal_service import (
    create_withdrawal_request,
    delete_withdrawal_method,
    get_withdrawal_eligibility,
    get_withdrawal_history,
    list_withdrawal_methods,
    save_withdrawal_method,
)
from utils.auth import json_error as auth_json_error, require_user_access

withdrawal_bp = Blueprint("withdrawal_bp", __name__)


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


@withdrawal_bp.post("/api/withdrawals/eligibility")
def withdrawal_eligibility():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("withdraw", data)
    if error:
        return error

    try:
        with get_connection() as conn:
            eligibility = get_withdrawal_eligibility(conn, user["user_id"])
        return jsonify({"success": True, "eligibility": eligibility})
    except ValueError as exc:
        return _json_error(str(exc), 404)


@withdrawal_bp.post("/api/withdrawals/request")
def withdrawal_request():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("withdraw", data)
    if error:
        return error

    amount = data.get("amount")
    method_id = data.get("method_id")
    network = data.get("network")
    number = data.get("number")
    name = data.get("name") or data.get("account_name") or data.get("accountName")

    if amount is None:
        return _json_error("Missing amount.")

    if not network or not number or not name:
        return _json_error("Missing withdrawal method details.")

    try:
        with get_connection() as conn:
            result = create_withdrawal_request(
                conn,
                user_id=user["user_id"],
                amount=amount,
                network=network,
                number=number,
                name=name,
                method_id=method_id,
            )
        return jsonify(
            {
                "success": True,
                "message": "Withdrawal request submitted successfully.",
                "request": result,
            }
        )
    except ValueError as exc:
        return _json_error(str(exc), 400)


@withdrawal_bp.post("/api/withdrawals/history")
def withdrawal_history():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("withdraw", data)
    if error:
        return error

    try:
        with get_connection() as conn:
            history = get_withdrawal_history(conn, user["user_id"])
        return jsonify({"success": True, "history": history})
    except ValueError as exc:
        return _json_error(str(exc), 404)


@withdrawal_bp.post("/api/withdrawal-methods/list")
def withdrawal_methods_list():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("withdraw", data)
    if error:
        return error

    try:
        with get_connection() as conn:
            methods = list_withdrawal_methods(conn, user["user_id"])
        return jsonify({"success": True, "methods": methods})
    except ValueError as exc:
        return _json_error(str(exc), 400)


@withdrawal_bp.post("/api/withdrawal-methods/save")
def withdrawal_methods_save():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("withdraw", data)
    if error:
        return error

    network = data.get("network")
    number = data.get("number")
    name = data.get("name")
    pin = data.get("pin")

    if not network or not number or not name:
        return _json_error("Missing withdrawal method details.")

    try:
        with get_connection() as conn:
            methods = save_withdrawal_method(
                conn,
                user_id=user["user_id"],
                network=network,
                number=number,
                name=name,
                pin=pin,
            )
        return jsonify(
            {
                "success": True,
                "message": "Withdrawal method saved successfully.",
                "methods": methods,
            }
        )
    except ValueError as exc:
        return _json_error(str(exc), 400)


@withdrawal_bp.post("/api/withdrawal-methods/delete")
def withdrawal_methods_delete():
    data = request.get_json(silent=True) or {}

    user, _payload, error = require_user_access("withdraw", data)
    if error:
        return error

    method_id = data.get("method_id")
    if not method_id:
        return _json_error("Missing method_id.")

    try:
        with get_connection() as conn:
            methods = delete_withdrawal_method(
                conn,
                user_id=user["user_id"],
                method_id=method_id,
            )
        return jsonify(
            {
                "success": True,
                "message": "Withdrawal method deleted successfully.",
                "methods": methods,
            }
        )
    except ValueError as exc:
        return _json_error(str(exc), 400)
