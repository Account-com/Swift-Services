from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request, session

from services.telegram_callback_service import process_manual_payment_approval_callback
from services.telegram_service import (
    configure_telegram_webhook,
    get_telegram_webhook_info,
    is_valid_telegram_webhook_request,
    telegram_webhook_url,
)


logger = logging.getLogger(__name__)
telegram_bp = Blueprint("telegram_bp", __name__)


def _admin_required_response():
    if session.get("admin"):
        return None
    return jsonify({"error": "Unauthorized"}), 401


@telegram_bp.get("/api/telegram/webhook/status")
def telegram_webhook_status():
    admin_error = _admin_required_response()
    if admin_error:
        return admin_error

    try:
        info = get_telegram_webhook_info()
    except Exception as exc:
        logger.exception("Failed to load Telegram webhook info.")
        return jsonify({
            "ok": False,
            "webhook_url": telegram_webhook_url(),
            "error": str(exc),
        }), 500

    return jsonify({
        "ok": True,
        "webhook_url": telegram_webhook_url(),
        "telegram": info,
    })


@telegram_bp.post("/api/telegram/webhook/configure")
def telegram_webhook_configure():
    admin_error = _admin_required_response()
    if admin_error:
        return admin_error

    data = request.get_json(silent=True) or {}
    try:
        result = configure_telegram_webhook(
            drop_pending_updates=bool(data.get("drop_pending_updates"))
        )
    except Exception as exc:
        logger.exception("Failed to configure Telegram webhook.")
        return jsonify({"ok": False, "error": str(exc)}), 400

    return jsonify({"ok": True, "webhook": result})


@telegram_bp.post("/api/telegram/webhook")
def telegram_webhook():
    if not is_valid_telegram_webhook_request(request.headers):
        logger.warning("Rejected Telegram webhook request with invalid secret token.")
        return jsonify({"ok": True})

    update = request.get_json(silent=True) or {}
    callback_query = update.get("callback_query") or {}
    if not callback_query:
        return jsonify({"ok": True})

    process_manual_payment_approval_callback(callback_query)

    return jsonify({"ok": True})
