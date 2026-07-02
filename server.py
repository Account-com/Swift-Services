import os
import sqlite3
import json
import hmac
import hashlib
import secrets
import time
import random

from config import ADMIN_PASSWORD, ADMIN_USERNAME, DATABASE_PATH, AVATAR_FILENAMES, AVATAR_PATH_PREFIX
from functools import wraps
from typing import Any
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from flask import Flask, request, jsonify, render_template, session, redirect, has_request_context
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

from routes.activity_routes import activity_bp
from routes.withdrawal_routes import withdrawal_bp
from routes.payment_routes import payment_bp
from routes.task_routes import task_bp
from routes.telegram_routes import telegram_bp
from utils.auth import clear_user_session, login_user_session, require_user_access as session_require_user_access
from routes.message_routes import message_bp
from database.apply_schema import apply_schema as apply_level_system_schema
from database.run_seeds import seed_admin as seed_admin_account
from database.seed_bonus_tasks import seed_bonus_tasks as seed_level_system_bonus_tasks
from database.seed_levels import seed_levels as seed_level_catalog
from database.seed_task_categories import seed_task_categories as seed_task_category_catalog
from services.message_service import (
    build_withdrawal_approved_message,
    build_withdrawal_rejected_message,
    create_message,
)
from services.manual_payment_service import (
    ACCOUNT_NAME as MANUAL_PAYMENT_ACCOUNT_NAME,
    ACCOUNT_NUMBER as MANUAL_PAYMENT_ACCOUNT_NUMBER,
    NETWORK as MANUAL_PAYMENT_NETWORK,
    approve_manual_payment,
    expire_pending_manual_payments,
    get_admin_manual_payments,
)
from services.payment_history_service import get_user_payment_history
from services.telegram_callback_service import process_manual_payment_approval_callback
from services.telegram_service import notify_manual_payment_approved, start_telegram_callback_polling


load_dotenv()

app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static",
    static_url_path="/static",
)

app.config.update(
    SECRET_KEY=os.getenv("SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE=os.getenv("SESSION_COOKIE_SAMESITE", "Lax"),
    SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "false").strip().lower() == "true",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=int(os.getenv("SESSION_LIFETIME_HOURS", "12"))),
)

app.register_blueprint(activity_bp)
app.register_blueprint(withdrawal_bp)
app.register_blueprint(payment_bp)
app.register_blueprint(task_bp)
app.register_blueprint(telegram_bp)
app.register_blueprint(message_bp)

start_telegram_callback_polling(process_manual_payment_approval_callback)

DATABASE = str(DATABASE_PATH)


PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "").strip()
PAYSTACK_PUBLIC_KEY = os.getenv("PAYSTACK_PUBLIC_KEY", "").strip()
BASE_PUBLIC_URL = os.getenv("BASE_PUBLIC_URL", "").strip().rstrip("/")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "support@example.com").strip()
SUPPORT_HOURS = os.getenv("SUPPORT_HOURS", "Mon-Fri 9:00 AM to 5:00 PM GMT").strip()
PUBLIC_APP_NAME = os.getenv("PUBLIC_APP_NAME", "EarnMaster Digital").strip()

PAYSTACK_CURRENCY = "GHS"
MIN_DEPOSIT_GHS = 50.0
MAX_DEPOSIT_GHS = 300.0

ALLOWED_TASKS = {"imageLabeling", "dataEntry", "socialMedia"}
PHASE1_REWARD = 30.0

BONUS_TASK_REWARD = 10.0
BONUS_TASK_SEED_DATA = [
    {
        "task_key": "bonus_headline_classifier",
        "title": "Headline Classifier",
        "category_key": "headline_classifier",
        "description": "Choose the best category for a current-style news headline.",
        "reward": BONUS_TASK_REWARD,
        "sort_order": 1,
        "payload": {
            "display_name": "Headline Classifier",
            "source_type": "bonus",
            "category_key": "headline_classifier",
            "content": {
                "headline": "Government unveils new digital ID upgrade",
                "options": ["Politics", "Sports", "Technology", "Health"],
                "answer": "Politics",
            },
        },
    },
    {
        "task_key": "bonus_duplicate_detection",
        "title": "Duplicate Detection",
        "category_key": "duplicate_detection",
        "description": "Decide whether the two items shown are identical.",
        "reward": BONUS_TASK_REWARD,
        "sort_order": 2,
        "payload": {
            "display_name": "Duplicate Detection",
            "source_type": "bonus",
            "category_key": "duplicate_detection",
            "content": {
                "item_a": "Blue ceramic mug",
                "item_b": "Blue ceramic mug",
                "options": ["Yes", "No"],
                "answer": "Yes",
            },
        },
    },
    {
        "task_key": "bonus_flag_country_match",
        "title": "Flag / Country Match",
        "category_key": "flag_country_match",
        "description": "Match the flag hint to the correct country.",
        "reward": BONUS_TASK_REWARD,
        "sort_order": 3,
        "payload": {
            "display_name": "Flag / Country Match",
            "source_type": "bonus",
            "category_key": "flag_country_match",
            "content": {
                "country": "Ghana",
                "hint": "Horizontal red-yellow-green with a black star.",
                "options": ["Ghana", "Kenya", "Cameroon", "Senegal"],
                "answer": "Ghana",
            },
        },
    },
]

ACCOUNT_STATUS_ACTIVE = "active"
ACCOUNT_STATUS_RESTRICTED = "restricted"
ACCOUNT_STATUS_UNDER_REVIEW = "under_review"
ACCOUNT_STATUS_BLOCKED = "blocked"

VALID_ACCOUNT_STATUSES = {
    ACCOUNT_STATUS_ACTIVE,
    ACCOUNT_STATUS_RESTRICTED,
    ACCOUNT_STATUS_UNDER_REVIEW,
    ACCOUNT_STATUS_BLOCKED,
}


# ======================
# DATABASE
# ======================


AVATAR_KEY_SET = set(AVATAR_FILENAMES)


def normalize_avatar_key(value):
    key = str(value or "").strip()
    return key if key in AVATAR_KEY_SET else ""


def avatar_url_for_key(value):
    key = normalize_avatar_key(value)
    return f"{AVATAR_PATH_PREFIX}{key}" if key else ""


def pick_random_avatar_key():
    return random.choice(AVATAR_FILENAMES) if AVATAR_FILENAMES else ""


def assign_missing_user_avatars(conn):
    if not column_exists(conn, "users", "avatar_key"):
        return

    rows = conn.execute(
        "SELECT user_id FROM users WHERE avatar_key IS NULL OR TRIM(COALESCE(avatar_key, '')) = ''"
    ).fetchall()
    if not rows:
        return

    for row in rows:
        conn.execute(
            "UPDATE users SET avatar_key=? WHERE user_id=?",
            (pick_random_avatar_key(), row["user_id"]),
        )


def get_db():
    conn = sqlite3.connect(DATABASE, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def now():
    return datetime.utcnow().isoformat()


def clean_person_name(value, *, allow_blank=False):
    text = " ".join(str(value or "").strip().split())
    if not text:
        return "" if allow_blank else ""
    allowed_chars = []
    for ch in text:
        if ch.isalpha() or ch in " -'":
            allowed_chars.append(ch)
    cleaned = " ".join("".join(allowed_chars).split())
    if not cleaned:
        return ""
    return " ".join(part[:1].upper() + part[1:].lower() for part in cleaned.split())


def column_exists(conn, table, column):
    cols = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r["name"] == column for r in cols)

def table_exists(conn, table):
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return bool(row)


def ensure_column(conn, table, column, definition):
    if not column_exists(conn, table, column):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    conn = get_db()
    c = conn.cursor()

    # USERS
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE,
        firstname TEXT,
        surname TEXT,
        phone TEXT UNIQUE,
        password TEXT,
        email TEXT,
        created_at TEXT,
        last_seen TEXT,
        balance REAL DEFAULT 0,
        avatar_key TEXT
    )
    """)

    if not column_exists(conn, "users", "balance"):
        c.execute("ALTER TABLE users ADD COLUMN balance REAL DEFAULT 0")

    if not column_exists(conn, "users", "email"):
        c.execute("ALTER TABLE users ADD COLUMN email TEXT")

    # ADMIN / SECURITY USER FIELDS
    ensure_column(conn, "users", "firstname", "TEXT")
    ensure_column(conn, "users", "surname", "TEXT")
    ensure_column(conn, "users", "account_status", "TEXT NOT NULL DEFAULT 'active'")
    ensure_column(conn, "users", "can_login", "INTEGER NOT NULL DEFAULT 1")
    ensure_column(conn, "users", "can_tasks", "INTEGER NOT NULL DEFAULT 1")
    ensure_column(conn, "users", "can_deposit", "INTEGER NOT NULL DEFAULT 1")
    ensure_column(conn, "users", "can_withdraw", "INTEGER NOT NULL DEFAULT 1")
    ensure_column(conn, "users", "flagged", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "users", "session_version", "INTEGER NOT NULL DEFAULT 1")
    ensure_column(conn, "users", "restricted_reason", "TEXT")
    ensure_column(conn, "users", "blocked_reason", "TEXT")
    ensure_column(conn, "users", "review_reason", "TEXT")
    ensure_column(conn, "users", "welcome_popup_hidden", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "users", "avatar_key", "TEXT")

    assign_missing_user_avatars(conn)

    # REQUESTS (manual withdrawals remain here)
    c.execute("""
    CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        kind TEXT,
        user_id TEXT,
        payload TEXT,
        status TEXT,
        created_at TEXT,
        decided_at TEXT
    )
    """)

    # ADMIN
    c.execute("""
    CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )
    """)

    # REWARD CLAIMS
    c.execute("""
    CREATE TABLE IF NOT EXISTS reward_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        task TEXT,
        phase INTEGER,
        amount REAL,
        claimed_at TEXT,
        UNIQUE(user_id, task, phase)
    )
    """)

    # PAYMENTS (automatic deposits)
    c.execute("""
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference TEXT UNIQUE,
        user_id TEXT,
        email TEXT,
        amount_ghs REAL,
        amount_subunit INTEGER,
        currency TEXT,
        provider TEXT,
        status TEXT,
        access_code TEXT,
        gateway_response TEXT,
        channel TEXT,
        paid_at TEXT,
        credited_at TEXT,
        customer_code TEXT,
        raw_response TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)

    payment_columns = {
        "reference": "TEXT UNIQUE",
        "user_id": "TEXT",
        "email": "TEXT",
        "amount_ghs": "REAL",
        "amount_subunit": "INTEGER",
        "currency": "TEXT",
        "provider": "TEXT",
        "status": "TEXT",
        "access_code": "TEXT",
        "gateway_response": "TEXT",
        "channel": "TEXT",
        "paid_at": "TEXT",
        "credited_at": "TEXT",
        "customer_code": "TEXT",
        "raw_response": "TEXT",
        "created_at": "TEXT",
        "updated_at": "TEXT",
    }

    for col, definition in payment_columns.items():
        if not column_exists(conn, "payments", col):
            c.execute(f"ALTER TABLE payments ADD COLUMN {col} {definition}")

    # Seed admin account (this ensures admin exists on every startup)
    seed_admin_account(conn)

    # AUDIT LOGS
    c.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_type TEXT NOT NULL DEFAULT 'admin',
        actor_id TEXT,
        action_group TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        reason TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
    )
    """)

    # RISK FLAGS
    c.execute("""
    CREATE TABLE IF NOT EXISTS risk_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        user_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_by TEXT,
        resolved_by TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT
    )
    """)

    # ADMIN NOTES
    c.execute("""
    CREATE TABLE IF NOT EXISTS admin_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        note TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL
    )
    """)


conn = get_db()
c = conn.cursor()

# BONUS TASKS (free tasks, once per user account)
c.execute("""
CREATE TABLE IF NOT EXISTS bonus_task_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category_key TEXT NOT NULL,
    description TEXT NOT NULL,
    task_payload_json TEXT NOT NULL,
    reward REAL NOT NULL DEFAULT 10,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
)
""")

c.execute("""
CREATE TABLE IF NOT EXISTS user_bonus_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    bonus_task_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    completed_at TEXT,
    reward_credited INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, bonus_task_id)
)
""")

for bonus_task in BONUS_TASK_SEED_DATA:
    c.execute(
        """
        INSERT OR IGNORE INTO bonus_task_catalog (
            task_key,
            title,
            category_key,
            description,
            task_payload_json,
            reward,
            sort_order,
            is_active,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        """,
        (
            bonus_task["task_key"],
            bonus_task["title"],
            bonus_task["category_key"],
            bonus_task["description"],
            json.dumps(bonus_task["payload"], ensure_ascii=False),
            float(bonus_task["reward"]),
            int(bonus_task["sort_order"]),
            now(),
        ),
    )

# INDEXES
if column_exists(conn, "users", "account_status"):
    c.execute("CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status)")

if column_exists(conn, "users", "flagged"):
    c.execute("CREATE INDEX IF NOT EXISTS idx_users_flagged ON users(flagged)")

if table_exists(conn, "audit_logs"):
    c.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_group ON audit_logs(action_group)")

if table_exists(conn, "risk_flags"):
    c.execute("CREATE INDEX IF NOT EXISTS idx_risk_flags_status ON risk_flags(status)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_risk_flags_target ON risk_flags(target_type, target_id)")

if table_exists(conn, "admin_notes"):
    c.execute("CREATE INDEX IF NOT EXISTS idx_admin_notes_user_id ON admin_notes(user_id)")
conn.commit()
conn.close()


def ensure_level_system_bootstrap():
    conn = get_db()
    try:
        missing_schema = not all(
            table_exists(conn, table_name)
            for table_name in (
                "level_catalog",
                "task_category_catalog",
                "user_levels",
                "user_level_tasks",
                "payment_intents",
            )
        )
        needs_level_seed = (
            table_exists(conn, "level_catalog")
            and int(conn.execute("SELECT COUNT(*) AS n FROM level_catalog").fetchone()["n"] or 0) == 0
        )
        needs_category_seed = (
            table_exists(conn, "task_category_catalog")
            and int(conn.execute("SELECT COUNT(*) AS n FROM task_category_catalog").fetchone()["n"] or 0) == 0
        )
        needs_bonus_seed = (
            table_exists(conn, "bonus_task_catalog")
            and int(conn.execute("SELECT COUNT(*) AS n FROM bonus_task_catalog").fetchone()["n"] or 0) == 0
        )
    finally:
        conn.close()

    if missing_schema:
        apply_level_system_schema()
        needs_level_seed = True
        needs_category_seed = True

    if needs_level_seed:
        seed_level_catalog()
    if needs_category_seed:
        seed_task_category_catalog()
    if needs_bonus_seed:
        seed_level_system_bonus_tasks()


init_db()
ensure_level_system_bootstrap()


# ======================
# HELPERS
# ======================
def generate_user_id():
    conn = get_db()
    row = conn.execute("SELECT MAX(id) AS max_id FROM users").fetchone()
    conn.close()
    max_id = row["max_id"] or 0
    return f"EMP{1000 + max_id + 1}"


def require_admin():
    return bool(session.get("admin"))


def get_user(conn, user_id):
    return conn.execute("SELECT * FROM users WHERE user_id=?", (user_id,)).fetchone()


def get_user_admin_state(conn, user_id):
    row = conn.execute("""
        SELECT
            user_id,
            phone,
            email,
            balance,
            avatar_key,
            created_at,
            last_seen,
            account_status,
            can_login,
            can_tasks,
            can_deposit,
            can_withdraw,
            flagged,
            session_version,
            restricted_reason,
            blocked_reason,
            review_reason
        FROM users
        WHERE user_id=?
    """, (user_id,)).fetchone()

    if not row:
        return None

    data = dict(row)
    data["can_login"] = bool(data["can_login"])
    data["can_tasks"] = bool(data["can_tasks"])
    data["can_deposit"] = bool(data["can_deposit"])
    data["can_withdraw"] = bool(data["can_withdraw"])
    data["flagged"] = bool(data["flagged"])
    data["session_version"] = int(data["session_version"] or 1)
    return data


def get_pending_withdrawal_summary(conn, user_id):
    rows = conn.execute(
        """
        SELECT payload
        FROM requests
        WHERE user_id = ?
          AND kind = 'withdrawal'
          AND status = 'pending'
        ORDER BY created_at DESC
        """,
        (user_id,),
    ).fetchall()

    total = 0.0
    count = 0
    for row in rows:
        try:
            payload = json.loads(row["payload"] or "{}")
        except Exception:
            payload = {}
        try:
            amount = float(payload.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0.0
        if amount > 0:
            total += amount
            count += 1

    return {"count": count, "total": round(total, 2)}


def get_premium_access_summary(conn, user_id):
    active_sources = []
    pending_sources = []

    if table_exists(conn, "payment_intents"):
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS payment_count,
                MAX(COALESCE(verified_at, updated_at, created_at)) AS last_paid_at
            FROM payment_intents
            WHERE user_id = ?
              AND (
                status IN ('success', 'successful', 'verified', 'completed', 'approved', 'credited')
                OR verified_at IS NOT NULL
              )
            """,
            (user_id,),
        ).fetchone()
        if row and int(row["payment_count"] or 0) > 0:
            active_sources.append(row["last_paid_at"])

        pending_row = conn.execute(
            """
            SELECT
                COUNT(*) AS payment_count,
                MAX(COALESCE(updated_at, created_at)) AS last_pending_at
            FROM payment_intents
            WHERE user_id = ?
              AND status IN ('held', 'pending', 'initialized', 'processing', 'under_review', 'review')
              AND verified_at IS NULL
            """,
            (user_id,),
        ).fetchone()
        if pending_row and int(pending_row["payment_count"] or 0) > 0:
            pending_sources.append(pending_row["last_pending_at"])

    if table_exists(conn, "payments"):
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS payment_count,
                MAX(COALESCE(credited_at, paid_at, updated_at, created_at)) AS last_paid_at
            FROM payments
            WHERE user_id = ?
              AND (status = 'success' OR credited_at IS NOT NULL)
            """,
            (user_id,),
        ).fetchone()
        if row and int(row["payment_count"] or 0) > 0:
            active_sources.append(row["last_paid_at"])

    if table_exists(conn, "manual_payments"):
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS payment_count,
                MAX(COALESCE(approved_at, updated_at, created_at)) AS last_paid_at
            FROM manual_payments
            WHERE user_id = ?
              AND status = 'approved'
            """,
            (user_id,),
        ).fetchone()
        if row and int(row["payment_count"] or 0) > 0:
            active_sources.append(row["last_paid_at"])

        pending_row = conn.execute(
            """
            SELECT
                COUNT(*) AS payment_count,
                MAX(COALESCE(pending_started_at, updated_at, created_at)) AS last_pending_at
            FROM manual_payments
            WHERE user_id = ?
              AND status = 'pending'
            """,
            (user_id,),
        ).fetchone()
        if pending_row and int(pending_row["payment_count"] or 0) > 0:
            pending_sources.append(pending_row["last_pending_at"])

    if table_exists(conn, "user_levels") and table_exists(conn, "level_catalog"):
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS unlocked_paid_levels,
                MAX(COALESCE(ul.unlocked_at, ul.updated_at, ul.created_at)) AS last_unlocked_at
            FROM user_levels ul
            JOIN level_catalog lc ON lc.id = ul.level_id
            WHERE ul.user_id = ?
              AND COALESCE(lc.unlock_fee, 0) > 0
              AND (
                ul.status != 'locked'
                OR ul.unlock_payment_status IN ('success', 'successful', 'verified', 'completed', 'approved', 'credited')
                OR ul.unlocked_at IS NOT NULL
              )
            """,
            (user_id,),
        ).fetchone()
        if row and int(row["unlocked_paid_levels"] or 0) > 0:
            active_sources.append(row["last_unlocked_at"])

    active_dates = [value for value in active_sources if value]
    pending_dates = [value for value in pending_sources if value]
    active = bool(active_sources)
    pending = bool(pending_sources)
    last_paid_at = max(active_dates) if active_dates else None
    last_pending_at = max(pending_dates) if pending_dates else None

    if active:
        status = "Active"
    elif pending:
        status = "Pending"
    else:
        status = "Locked"

    return {
        "active": active,
        "status": status,
        "last_paid_at": last_paid_at,
        "pending": pending,
        "last_pending_at": last_pending_at,
    }


def build_public_user_payload(conn, user_row, *, include_phone=False):
    pending = get_pending_withdrawal_summary(conn, user_row["user_id"])
    premium_access = get_premium_access_summary(conn, user_row["user_id"])
    payload = {
        "user_id": user_row["user_id"],
        "firstname": user_row["firstname"],
        "surname": user_row["surname"],
        "balance": float(user_row["balance"] or 0),
        "avatar_key": normalize_avatar_key(user_row["avatar_key"] if "avatar_key" in user_row.keys() else None),
        "avatar_url": avatar_url_for_key(user_row["avatar_key"] if "avatar_key" in user_row.keys() else None),
        "email": user_row["email"],
        "created_at": user_row["created_at"],
        "last_seen": user_row["last_seen"],
        "account_status": user_row["account_status"],
        "can_login": bool(user_row["can_login"]),
        "can_tasks": bool(user_row["can_tasks"]),
        "can_deposit": bool(user_row["can_deposit"]),
        "can_withdraw": bool(user_row["can_withdraw"]),
        "flagged": bool(user_row["flagged"]),
        "session_version": int(user_row["session_version"] or 1),
        "restricted_reason": user_row["restricted_reason"],
        "blocked_reason": user_row["blocked_reason"],
        "review_reason": user_row["review_reason"],
        "welcome_popup_hidden": bool(user_row["welcome_popup_hidden"]),
        "show_welcome_popup": not bool(user_row["welcome_popup_hidden"]),
        "pending_withdrawal_count": pending["count"],
        "pending_withdrawal_total": pending["total"],
        "premium_access_active": premium_access["active"],
        "premium_access_status": premium_access["status"],
        "premium_access_last_paid_at": premium_access["last_paid_at"],
        "premium_access_pending": premium_access["pending"],
        "premium_access_last_pending_at": premium_access["last_pending_at"],
    }
    if include_phone:
        payload["phone"] = user_row["phone"]
    return payload


def log_audit_event(
    action_group,
    action_type,
    target_type,
    target_id,
    summary,
    actor_type="admin",
    actor_id=None,
    reason=None,
    metadata_json=None,
):
    conn = get_db()
    conn.execute("""
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
    """, (
        actor_type,
        actor_id,
        action_group,
        action_type,
        target_type,
        target_id,
        summary,
        reason,
        metadata_json,
        now(),
    ))
    conn.commit()
    conn.close()


def create_risk_flag(
    category,
    severity,
    target_type,
    target_id,
    title,
    description="",
    user_id=None,
    created_by=None,
):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO risk_flags (
            category,
            severity,
            target_type,
            target_id,
            user_id,
            title,
            description,
            status,
            created_by,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    """, (
        category,
        severity,
        target_type,
        target_id,
        user_id,
        title,
        description,
        created_by,
        now(),
    ))
    conn.commit()
    risk_id = cur.lastrowid
    conn.close()
    return risk_id


def add_admin_note(user_id, note, created_by=None):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO admin_notes (
            user_id,
            note,
            created_by,
            created_at
        )
        VALUES (?, ?, ?, ?)
    """, (
        user_id,
        note,
        created_by,
        now(),
    ))
    conn.commit()
    note_id = cur.lastrowid
    conn.close()
    return note_id


def set_user_account_status(user_id, status, reason=None, actor_id=None):
    if status not in VALID_ACCOUNT_STATUSES:
        raise ValueError("Invalid account status")

    conn = get_db()
    user = get_user(conn, user_id)
    if not user:
        conn.close()
        raise ValueError("User not found")

    can_login = 1
    can_tasks = 1
    can_deposit = 1
    can_withdraw = 1
    flagged = 0
    restricted_reason = None
    blocked_reason = None
    review_reason = None
    session_version = int(user["session_version"] or 1) if "session_version" in user.keys() else 1

    if status == ACCOUNT_STATUS_RESTRICTED:
        flagged = 1
        can_withdraw = 0
        restricted_reason = reason
    elif status == ACCOUNT_STATUS_UNDER_REVIEW:
        flagged = 1
        can_tasks = 0
        can_withdraw = 0
        review_reason = reason
    elif status == ACCOUNT_STATUS_BLOCKED:
        flagged = 1
        can_login = 0
        can_tasks = 0
        can_deposit = 0
        can_withdraw = 0
        blocked_reason = reason
        session_version += 1

    conn.execute("""
        UPDATE users
        SET
            account_status=?,
            can_login=?,
            can_tasks=?,
            can_deposit=?,
            can_withdraw=?,
            flagged=?,
            session_version=?,
            restricted_reason=?,
            blocked_reason=?,
            review_reason=?
        WHERE user_id=?
    """, (
        status,
        can_login,
        can_tasks,
        can_deposit,
        can_withdraw,
        flagged,
        session_version,
        restricted_reason,
        blocked_reason,
        review_reason,
        user_id,
    ))
    conn.commit()
    conn.close()

    log_audit_event(
        action_group="user",
        action_type="set_account_status",
        target_type="user",
        target_id=user_id,
        summary=f"Set account status for {user_id} to {status}",
        actor_id=actor_id,
        reason=reason,
    )


def force_logout_user(user_id, actor_id=None, reason=None):
    conn = get_db()
    user = get_user(conn, user_id)
    if not user:
        conn.close()
        raise ValueError("User not found")

    current_version = int(user["session_version"] or 1) if "session_version" in user.keys() else 1

    conn.execute(
        "UPDATE users SET session_version=? WHERE user_id=?",
        (current_version + 1, user_id),
    )
    conn.commit()
    conn.close()

    log_audit_event(
        action_group="user",
        action_type="force_logout",
        target_type="user",
        target_id=user_id,
        summary=f"Forced logout for {user_id}",
        actor_id=actor_id,
        reason=reason,
    )


def set_user_permission(user_id, permission_key, allowed, actor_id=None, reason=None):
    valid_keys = {"can_login", "can_tasks", "can_deposit", "can_withdraw"}
    if permission_key not in valid_keys:
        raise ValueError("Invalid permission key")

    conn = get_db()
    user = get_user(conn, user_id)
    if not user:
        conn.close()
        raise ValueError("User not found")

    can_login = bool(user["can_login"])
    can_tasks = bool(user["can_tasks"])
    can_deposit = bool(user["can_deposit"])
    can_withdraw = bool(user["can_withdraw"])

    if permission_key == "can_login":
        can_login = bool(allowed)
    elif permission_key == "can_tasks":
        can_tasks = bool(allowed)
    elif permission_key == "can_deposit":
        can_deposit = bool(allowed)
    elif permission_key == "can_withdraw":
        can_withdraw = bool(allowed)

    session_version = int(user["session_version"] or 1) if "session_version" in user.keys() else 1

    # If login gets disabled, invalidate active sessions immediately
    if permission_key == "can_login" and not allowed:
        session_version += 1

    current_status = user["account_status"] or ACCOUNT_STATUS_ACTIVE

    # Keep account status aligned with permissions
    if not can_login:
        account_status = ACCOUNT_STATUS_BLOCKED
        flagged = 1
        restricted_reason = None
        blocked_reason = reason or "Login access disabled by admin"
        review_reason = None
    elif current_status == ACCOUNT_STATUS_UNDER_REVIEW:
        account_status = ACCOUNT_STATUS_UNDER_REVIEW
        flagged = 1
        restricted_reason = None
        blocked_reason = None
        review_reason = user["review_reason"] or reason
    elif not (can_tasks and can_deposit and can_withdraw):
        account_status = ACCOUNT_STATUS_RESTRICTED
        flagged = 1
        restricted_reason = reason or "One or more access permissions disabled"
        blocked_reason = None
        review_reason = None
    else:
        account_status = ACCOUNT_STATUS_ACTIVE
        flagged = 0
        restricted_reason = None
        blocked_reason = None
        review_reason = None

    conn.execute("""
        UPDATE users
        SET
            can_login=?,
            can_tasks=?,
            can_deposit=?,
            can_withdraw=?,
            account_status=?,
            flagged=?,
            session_version=?,
            restricted_reason=?,
            blocked_reason=?,
            review_reason=?
        WHERE user_id=?
    """, (
        1 if can_login else 0,
        1 if can_tasks else 0,
        1 if can_deposit else 0,
        1 if can_withdraw else 0,
        account_status,
        flagged,
        session_version,
        restricted_reason,
        blocked_reason,
        review_reason,
        user_id,
    ))
    conn.commit()
    conn.close()

    log_audit_event(
        action_group="user",
        action_type="set_permission",
        target_type="user",
        target_id=user_id,
        summary=(
            f"Set {permission_key} for {user_id} to "
            f"{'allowed' if allowed else 'denied'}; account status now {account_status}"
        ),
        actor_id=actor_id,
        reason=reason,
    )


PERMISSION_FIELD_MAP = {
    "tasks": "can_tasks",
    "deposit": "can_deposit",
    "withdraw": "can_withdraw",
}

PERMISSION_LABEL_MAP = {
    "tasks": "Task",
    "deposit": "Deposit",
    "withdraw": "Withdrawal",
}


def get_admin_actor_id():
    return session.get("admin_username") or "admin"


def admin_api_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not require_admin():
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*args, **kwargs)
    return wrapper


def parse_json_text(value, fallback=None):
    fallback = fallback if fallback is not None else {}
    try:
        return json.loads(value or "{}")
    except Exception:
        return fallback


def serialize_user_admin(row):
    data = dict(row)
    data["can_login"] = bool(data.get("can_login"))
    data["can_tasks"] = bool(data.get("can_tasks"))
    data["can_deposit"] = bool(data.get("can_deposit"))
    data["can_withdraw"] = bool(data.get("can_withdraw"))
    data["flagged"] = bool(data.get("flagged"))
    data["session_version"] = int(data.get("session_version") or 1)
    return data


def serialize_payment_admin(row):
    if not row:
        return None
    data = dict(row)
    data["credited"] = bool(data.get("credited_at"))
    return data


def normalize_admin_payment_status(status, verified_at=None):
    raw = str(status or "").strip().lower()
    if verified_at or raw in ("success", "successful", "verified", "completed", "approved", "credited"):
        return "success"
    if raw in ("failed", "rejected", "amount_mismatch", "mismatch", "expired", "abandoned", "cancelled", "canceled", "declined"):
        return "failed"
    if raw in ("held", "pending", "initialized", "processing", "under_review", "review"):
        return "pending"
    return raw or "pending"


def serialize_admin_payment_intent(row):
    if not row:
        return None

    payment = dict(row)

    payment_type = str(payment.get("payment_type") or "").strip().lower()
    paid_amount = float(payment.get("amount") or 0)
    level_number = payment.get("level_number")
    completion_reward = payment.get("completion_reward")
    unlock_fee = payment.get("unlock_fee")
    final_stage_fee = payment.get("final_stage_fee")

    expected_amount = paid_amount
    if payment_type in ("level_unlock", "final_stage_unlock") and completion_reward is not None:
        expected_amount = float(completion_reward or 0)
    elif payment_type == "level_unlock" and unlock_fee is not None:
        expected_amount = float(completion_reward or unlock_fee or paid_amount)
    elif payment_type == "final_stage_unlock" and final_stage_fee is not None:
        expected_amount = float(completion_reward or final_stage_fee or paid_amount)

    return {
        "id": f"pi_{payment.get('id')}",
        "user_id": payment.get("user_id"),
        "type": payment_type,
        "payment_type": payment_type,
        "level_id": payment.get("level_id"),
        "level_number": level_number if level_number is not None else payment.get("level_id"),
        "expected_amount": round(float(expected_amount or 0), 2),
        "paid_amount": round(paid_amount, 2),
        "reference": payment.get("reference"),
        "status": normalize_admin_payment_status(payment.get("status"), payment.get("verified_at")),
        "created_at": payment.get("created_at"),
        "updated_at": payment.get("updated_at"),
        "verified_at": payment.get("verified_at"),
        "provider": payment.get("provider"),
        "provider_access_code": payment.get("provider_access_code"),
        "raw_response": payment.get("provider_response_raw"),
        "source": "payment_intent",
    }


def serialize_admin_legacy_payment(row):
    if not row:
        return None

    payment = dict(row)
    paid_amount = float(payment.get("amount_ghs") or 0)
    raw_status = normalize_admin_payment_status(payment.get("status"), payment.get("credited_at"))

    return {
        "id": f"pay_{payment.get('id')}",
        "user_id": payment.get("user_id"),
        "type": "deposit",
        "payment_type": "deposit",
        "level_id": None,
        "level_number": None,
        "expected_amount": round(paid_amount, 2),
        "paid_amount": round(paid_amount, 2),
        "reference": payment.get("reference"),
        "status": raw_status,
        "created_at": payment.get("created_at"),
        "updated_at": payment.get("updated_at"),
        "verified_at": payment.get("credited_at"),
        "provider": payment.get("provider"),
        "provider_access_code": payment.get("access_code"),
        "raw_response": payment.get("raw_response"),
        "source": "legacy_payment",
    }


def serialize_admin_manual_payment(row):
    if not row:
        return None

    payment = dict(row)
    amount = float(payment.get("amount") or 0)
    raw_status = str(payment.get("status") or "pending").strip().lower()
    account_number = payment.get("account_number") or payment.get("phone_number") or ""
    account_name = payment.get("account_name") or ""

    return {
        "id": f"mp_{payment.get('id')}",
        "user_id": payment.get("user_id"),
        "full_name": payment.get("full_name"),
        "email": payment.get("email"),
        "type": payment.get("payment_type") or "level_unlock",
        "payment_type": payment.get("payment_type") or "level_unlock",
        "level_id": payment.get("level_id"),
        "level_number": payment.get("level_number") if payment.get("level_number") is not None else payment.get("level_id"),
        "expected_amount": round(amount, 2),
        "paid_amount": round(amount, 2),
        "amount": round(amount, 2),
        "reference": payment.get("reference"),
        "status": raw_status,
        "created_at": payment.get("created_at"),
        "updated_at": payment.get("updated_at"),
        "verified_at": payment.get("approved_at") if raw_status == "approved" else None,
        "approved_at": payment.get("approved_at"),
        "approved_by": payment.get("approved_by"),
        "approval_source": payment.get("approval_source"),
        "failed_at": payment.get("failed_at"),
        "expired_at": payment.get("expired_at"),
        "failure_reason": payment.get("failure_reason"),
        "expires_at": payment.get("expires_at"),
        "pending_started_at": payment.get("pending_started_at") or payment.get("created_at"),
        "cancelled_at": payment.get("cancelled_at"),
        "cancelled_by": payment.get("cancelled_by"),
        "cancellation_reason": payment.get("cancellation_reason"),
        "telegram_message_id": payment.get("telegram_message_id"),
        "telegram_notified_at": payment.get("telegram_notified_at"),
        "telegram_notification_status": payment.get("telegram_notification_status"),
        "telegram_notification_error": payment.get("telegram_notification_error"),
        "telegram_approved_notified_at": payment.get("telegram_approved_notified_at"),
        "telegram_cancel_notified_at": payment.get("telegram_cancel_notified_at"),
        "telegram_last_update_at": payment.get("telegram_last_update_at"),
        "provider": "manual",
        "payment_method": payment.get("payment_method") or "manual",
        "network_type": payment.get("network_type") or "MTN",
        "phone_number": payment.get("phone_number"),
        "account_number": account_number,
        "account_name": account_name,
        "payer_account_number": account_number,
        "payer_account_name": account_name,
        "merchant_account_number": MANUAL_PAYMENT_ACCOUNT_NUMBER,
        "merchant_account_name": MANUAL_PAYMENT_ACCOUNT_NAME,
        "source": "manual_payment",
        "can_approve": raw_status == "pending",
        "can_cancel": raw_status == "pending",
    }


def serialize_request_admin(conn, row):
    if not row:
        return None

    payload = parse_json_text(row["payload"], {})
    user = get_user_admin_state(conn, row["user_id"])

    network = (
        payload.get("network")
        or payload.get("method")
        or ""
    )

    number = (
        payload.get("number")
        or payload.get("phone")
        or ""
    )

    name = (
        payload.get("name")
        or payload.get("accountName")
        or payload.get("account_name")
        or ""
    )

    return {
        "id": row["id"],
        "kind": row["kind"],
        "user_id": row["user_id"],
        "payload": payload,
        "status": row["status"],
        "created_at": row["created_at"],
        "decided_at": row["decided_at"],
        "amount": payload.get("amount"),
        "network": network,
        "number": number,
        "name": name,
        "user_state": user,
    }

def serialize_audit_log(row):
    return dict(row)


def serialize_risk_flag(row):
    return dict(row)


def apply_payment_decision(reference, decision_value, actor_id=None, reason=None):
    if decision_value not in ("approve", "reject", "hold", "mismatch"):
        raise ValueError("Invalid payment decision")

    if decision_value == "approve":
        result = verify_and_credit_reference(reference)
        if not result.get("ok"):
            raise ValueError(result.get("message", "Verification failed"))
        if result.get("status") != "success":
            raise ValueError(f"Payment is not successful: {result.get('status')}")

        log_audit_event(
            action_group="payment",
            action_type="approve",
            target_type="payment",
            target_id=reference,
            summary=f"Approved payment {reference}",
            actor_id=actor_id,
            reason=reason,
        )
    else:
        conn = get_db()
        row = conn.execute("SELECT * FROM payments WHERE reference=?", (reference,)).fetchone()
        if not row:
            conn.close()
            raise ValueError("Payment not found")

        new_status = {
            "reject": "rejected",
            "hold": "held",
            "mismatch": "amount_mismatch",
        }[decision_value]

        conn.execute(
            "UPDATE payments SET status=?, updated_at=? WHERE reference=?",
            (new_status, now(), reference),
        )
        conn.commit()
        conn.close()

        log_audit_event(
            action_group="payment",
            action_type=decision_value,
            target_type="payment",
            target_id=reference,
            summary=f"Marked payment {reference} as {new_status}",
            actor_id=actor_id,
            reason=reason,
        )

        if decision_value == "mismatch":
            create_risk_flag(
                category="payment",
                severity="high",
                target_type="payment",
                target_id=reference,
                title="Payment amount mismatch",
                description=f"Admin marked payment {reference} as amount mismatch.",
                created_by=actor_id,
            )

    conn = get_db()
    refreshed = conn.execute("SELECT * FROM payments WHERE reference=?", (reference,)).fetchone()
    conn.close()
    return serialize_payment_admin(refreshed)


def apply_withdrawal_decision(request_id, decision_value, actor_id=None, reason=None):
    if decision_value not in ("approved", "rejected", "held"):
        raise ValueError("Invalid withdrawal decision")

    conn = get_db()
    req = conn.execute(
        "SELECT * FROM requests WHERE id=? AND kind='withdrawal'",
        (request_id,),
    ).fetchone()

    if not req:
        conn.close()
        raise ValueError("Withdrawal request not found")

    req_payload = parse_payload(req["payload"])

    if req["status"] != "pending":
        current_status = req["status"]
        conn.close()
        raise ValueError(f"Withdrawal request already decided as {current_status}")

    if decision_value == "held":
        conn.execute(
            "UPDATE requests SET status=?, decided_at=? WHERE id=?",
            ("held", now(), request_id),
        )
        conn.commit()
        conn.close()

        log_audit_event(
            action_group="withdrawal",
            action_type="hold",
            target_type="request",
            target_id=request_id,
            summary=f"Held withdrawal request {request_id}",
            actor_id=actor_id,
            reason=reason,
        )

        conn = get_db()
        refreshed = conn.execute("SELECT * FROM requests WHERE id=?", (request_id,)).fetchone()
        result = serialize_request_admin(conn, refreshed)
        conn.close()
        return result

    conn.execute(
        "UPDATE requests SET status=?, decided_at=? WHERE id=?",
        (decision_value, now(), request_id),
    )

    if decision_value == "approved":
        amount = clamp_amount(req_payload.get("amount"))

        if amount is None or amount <= 0:
            conn.execute(
                "UPDATE requests SET status=?, decided_at=? WHERE id=?",
                ("rejected", now(), request_id),
            )
            conn.commit()

            try:
                title, body = build_withdrawal_rejected_message(
                    req_payload.get("amount"),
                    req_payload.get("network"),
                    req_payload.get("number"),
                    request_id,
                    reason="The requested amount was invalid",
                )
                create_message(
                    conn,
                    req["user_id"],
                    title,
                    body,
                    "withdrawal_rejected",
                )
            except Exception:
                pass

            conn.close()
            raise ValueError("Invalid withdrawal amount")

        # The request already reserved and deducted the amount when it was created.
        # Approval should therefore validate the reserved request amount only and
        # must not re-check the live balance or deduct again.
        # The amount was already reserved and deducted at request time.

    conn.commit()
    conn.close()

    if decision_value == "approved":
        try:
            conn_msg = get_db()
            title, body = build_withdrawal_approved_message(
                req_payload.get("amount"),
                req_payload.get("network"),
                req_payload.get("number"),
                request_id,
            )
            create_message(
                conn_msg,
                req["user_id"],
                title,
                body,
                "withdrawal_approved",
            )
            conn_msg.close()
        except Exception:
            pass
    elif decision_value == "rejected":
        try:
            conn_msg = get_db()
            title, body = build_withdrawal_rejected_message(
                req_payload.get("amount"),
                req_payload.get("network"),
                req_payload.get("number"),
                request_id,
                reason=reason or "Not approved by admin",
            )
            create_message(
                conn_msg,
                req["user_id"],
                title,
                body,
                "withdrawal_rejected",
            )
            conn_msg.close()
        except Exception:
            pass

    log_audit_event(
        action_group="withdrawal",
        action_type=decision_value,
        target_type="request",
        target_id=request_id,
        summary=f"Marked withdrawal request {request_id} as {decision_value}",
        actor_id=actor_id,
        reason=reason,
    )

    conn = get_db()
    refreshed = conn.execute("SELECT * FROM requests WHERE id=?", (request_id,)).fetchone()
    result = serialize_request_admin(conn, refreshed)
    conn.close()
    return result


def require_user_access(required_permission=None):
    return session_require_user_access(required_permission=required_permission)


def clamp_amount(x):
    try:
        return float(x)
    except Exception:
        return None


def parse_payload(payload_text):
    try:
        return json.loads(payload_text or "{}")
    except Exception:
        return {}
    
def normalize_admin_user_row(row):
    if not row:
        return None

    data = dict(row)

    data["account_status"] = data.get("account_status") or "active"
    data["can_login"] = bool(data.get("can_login", 1))
    data["can_tasks"] = bool(data.get("can_tasks", 1))
    data["can_deposit"] = bool(data.get("can_deposit", 1))
    data["can_withdraw"] = bool(data.get("can_withdraw", 1))
    data["flagged"] = bool(data.get("flagged", 0))
    data["session_version"] = int(data.get("session_version") or 1)

    return data


def serialize_admin_withdrawal_row(row):
    payload = parse_payload(row["payload"])
    return {
        "id": row["id"],
        "status": row["status"],
        "created_at": row["created_at"],
        "decided_at": row["decided_at"],
        "amount": payload.get("amount"),
        "network": payload.get("network") or payload.get("method") or "",
        "number": payload.get("number") or payload.get("phone") or "",
        "name": payload.get("name") or payload.get("accountName") or payload.get("account_name") or "",
        "method_id": payload.get("method_id"),
    }


def build_admin_level_summary(conn, user_id):
    summary = {
        "active_level_id": None,
        "active_level_number": None,
        "active_level_status": None,
        "completed_levels_count": 0,
        "total_levels": 0,
        "progress_percent": 0.0,
        "latest_completed_level_number": None,
    }

    if not table_exists(conn, "user_levels") or not table_exists(conn, "level_catalog"):
        return summary

    total_row = conn.execute("""
        SELECT COUNT(*) AS total_levels
        FROM level_catalog
        WHERE is_active = 1
    """).fetchone()

    completed_row = conn.execute("""
        SELECT COUNT(*) AS completed_levels_count
        FROM user_levels
        WHERE user_id = ?
          AND status = 'completed'
    """, (user_id,)).fetchone()

    active_row = conn.execute("""
        SELECT
            ul.level_id,
            ul.status,
            lc.level_number
        FROM user_levels ul
        JOIN level_catalog lc ON lc.id = ul.level_id
        WHERE ul.user_id = ?
          AND ul.status IN ('active_base', 'active_final_stage_pending', 'active_final_stage_open')
        ORDER BY ul.started_at ASC, ul.id ASC
        LIMIT 1
    """, (user_id,)).fetchone()

    latest_completed_row = conn.execute("""
        SELECT lc.level_number
        FROM user_levels ul
        JOIN level_catalog lc ON lc.id = ul.level_id
        WHERE ul.user_id = ?
          AND ul.status = 'completed'
        ORDER BY ul.completed_at DESC, ul.id DESC
        LIMIT 1
    """, (user_id,)).fetchone()

    total_levels = int((total_row["total_levels"] or 0) if total_row else 0)
    completed_levels_count = int((completed_row["completed_levels_count"] or 0) if completed_row else 0)
    progress_percent = round((completed_levels_count / total_levels) * 100, 2) if total_levels else 0.0

    summary["total_levels"] = total_levels
    summary["completed_levels_count"] = completed_levels_count
    summary["progress_percent"] = progress_percent

    if active_row:
        summary["active_level_id"] = active_row["level_id"]
        summary["active_level_number"] = active_row["level_number"]
        summary["active_level_status"] = active_row["status"]
    elif column_exists(conn, "users", "current_active_level_id"):
        fallback_active = conn.execute(
            """
            SELECT
                u.current_active_level_id AS level_id,
                lc.level_number,
                ul.status
            FROM users u
            LEFT JOIN level_catalog lc ON lc.id = u.current_active_level_id
            LEFT JOIN user_levels ul
                ON ul.user_id = u.user_id
               AND ul.level_id = u.current_active_level_id
            WHERE u.user_id = ?
              AND u.current_active_level_id IS NOT NULL
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()
        if fallback_active:
            summary["active_level_id"] = fallback_active["level_id"]
            summary["active_level_number"] = fallback_active["level_number"]
            summary["active_level_status"] = fallback_active["status"]

    if latest_completed_row:
        summary["latest_completed_level_number"] = latest_completed_row["level_number"]

    return summary


def paystack_headers():
    return {
        "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
    }


def paystack_post(path, payload):
    url = f"https://api.paystack.co{path}"
    body = json.dumps(payload).encode("utf-8")
    req = Request(url, data=body, headers=paystack_headers(), method="POST")

    try:
        with urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            try:
                return json.loads(raw)
            except Exception:
                return {
                    "status": False,
                    "message": f"Invalid JSON from Paystack: {raw[:300]}"
                }
    except HTTPError as e:
        raw = ""
        try:
            raw = e.read().decode("utf-8")
        except Exception:
            raw = ""
        try:
            return json.loads(raw)
        except Exception:
            return {
                "status": False,
                "message": f"HTTP Error {e.code}: {e.reason}",
                "raw": raw[:300]
            }
    except URLError as e:
        return {
            "status": False,
            "message": f"{e}"
        }
    except Exception as e:
        return {
            "status": False,
            "message": f"Unexpected Paystack error: {e}"
        }


def paystack_get(path):
    url = f"https://api.paystack.co{path}"
    req = Request(url, headers=paystack_headers(), method="GET")
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        try:
            data = json.loads(e.read().decode("utf-8"))
        except Exception:
            data = {"status": False, "message": str(e)}
        return data
    except URLError as e:
        return {"status": False, "message": str(e)}


def get_public_base_url():
    if BASE_PUBLIC_URL:
        return BASE_PUBLIC_URL
    if has_request_context():
        return request.host_url.rstrip("/")
    return ""


def make_deposit_reference(user_id):
    return f"DEP_{user_id}_{int(time.time() * 1000)}_{secrets.token_hex(3)}"


def callback_url():
    return f"{get_public_base_url()}/payment/callback"


def webhook_url():
    return f"{get_public_base_url()}/api/paystack/webhook"


def save_user_email(conn, user_id, email):
    conn.execute("UPDATE users SET email=?, last_seen=? WHERE user_id=?", (email, now(), user_id))


def create_payment_row(conn, reference, user_id, email, amount_ghs, amount_subunit, access_code):
    ts = now()
    conn.execute("""
        INSERT INTO payments (
            reference, user_id, email, amount_ghs, amount_subunit, currency,
            provider, status, access_code, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        reference,
        user_id,
        email,
        amount_ghs,
        amount_subunit,
        PAYSTACK_CURRENCY,
        "paystack",
        "initialized",
        access_code,
        ts,
        ts,
    ))


def update_payment_from_verify(conn, payment_data):
    reference = payment_data.get("reference")
    gateway_response = payment_data.get("gateway_response")
    channel = payment_data.get("channel")
    status = payment_data.get("status")
    paid_at = payment_data.get("paid_at")
    customer = payment_data.get("customer") or {}
    customer_code = customer.get("customer_code")

    conn.execute("""
        UPDATE payments
        SET
            status=?,
            gateway_response=?,
            channel=?,
            paid_at=?,
            customer_code=?,
            raw_response=?,
            updated_at=?
        WHERE reference=?
    """, (
        status,
        gateway_response,
        channel,
        paid_at,
        customer_code,
        json.dumps(payment_data),
        now(),
        reference,
    ))

    row = conn.execute("SELECT * FROM payments WHERE reference=?", (reference,)).fetchone()
    return row


def credit_payment_once(conn, payment_row):
    if not payment_row:
        return False, "Payment not found"
    if payment_row["credited_at"]:
        return False, "Already credited"
    if payment_row["status"] != "success":
        return False, "Payment not successful"

    user = get_user(conn, payment_row["user_id"])
    if not user:
        return False, "User not found"

    conn.execute(
        "UPDATE users SET balance = COALESCE(balance,0) + ?, last_seen=? WHERE user_id=?",
        (float(payment_row["amount_ghs"] or 0), now(), payment_row["user_id"]),
    )
    conn.execute(
        "UPDATE payments SET credited_at=?, updated_at=? WHERE reference=?",
        (now(), now(), payment_row["reference"]),
    )
    return True, "Credited"


def verify_and_credit_reference(reference):
    data = paystack_get(f"/transaction/verify/{reference}")
    if not data.get("status"):
        return {"ok": False, "message": data.get("message", "Verification failed"), "data": data}

    payment_data = data.get("data") or {}
    verified_status = payment_data.get("status")
    verified_amount = int(payment_data.get("amount") or 0)

    conn = get_db()
    payment_row = conn.execute("SELECT * FROM payments WHERE reference=?", (reference,)).fetchone()
    if not payment_row:
        conn.close()
        return {"ok": False, "message": "Payment row not found", "data": payment_data}

    expected_amount = int(payment_row["amount_subunit"] or 0)
    if verified_amount != expected_amount:
        conn.execute("""
            UPDATE payments
            SET status=?, gateway_response=?, raw_response=?, updated_at=?
            WHERE reference=?
        """, (
            "amount_mismatch",
            "Verified amount does not match expected amount",
            json.dumps(payment_data),
            now(),
            reference,
        ))
        conn.commit()
        conn.close()
        return {"ok": False, "message": "Amount mismatch", "data": payment_data}

    payment_row = update_payment_from_verify(conn, payment_data)
    credited = False

    if verified_status == "success":
        credited, _ = credit_payment_once(conn, payment_row)

    conn.commit()
    refreshed_user = get_user(conn, payment_row["user_id"])
    result = {
        "ok": True,
        "credited": credited,
        "status": verified_status,
        "balance": float(refreshed_user["balance"] or 0) if refreshed_user else 0,
        "reference": reference,
        "data": payment_data,
    }
    conn.close()
    return result


# ======================
# CACHE CONTROL
# ======================
@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if app.config.get("SESSION_COOKIE_SECURE"):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ======================
# USER AUTH
# ======================
@app.post("/api/register")
def register():
    data = request.json or {}
    firstname = clean_person_name(data.get("firstname") or data.get("first_name") or data.get("firstName"))
    surname = clean_person_name(data.get("surname") or data.get("last_name") or data.get("lastName"), allow_blank=True)
    phone = (data.get("phone") or "").strip()
    password = data.get("password") or ""

    if not firstname:
        return jsonify({"error": "Firstname is required"}), 400

    if not phone or not password:
        return jsonify({"error": "Missing fields"}), 400

    if not phone.isdigit() or len(phone) != 10 or not phone.startswith("0"):
        return jsonify({"error": "Phone must be 10 digits and start with 0"}), 400

    conn = get_db()
    existing = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "Phone already registered"}), 400

    user_id = generate_user_id()
    hashed = generate_password_hash(password)

    avatar_key = pick_random_avatar_key()

    conn.execute("""
    INSERT INTO users (user_id, firstname, surname, phone, password, email, created_at, last_seen, balance, avatar_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, firstname, surname or None, phone, hashed, None, now(), now(), 0, avatar_key))

    conn.commit()
    user = conn.execute("SELECT * FROM users WHERE user_id=?", (user_id,)).fetchone()
    payload = build_public_user_payload(conn, user)
    conn.close()

    login_user_session(dict(user))

    return jsonify(payload)

@app.post("/api/login")
def login():
    data = request.json or {}
    phone = (data.get("phone") or "").strip()
    password = data.get("password") or ""

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()

    if not user or not check_password_hash(user["password"], password):
        conn.close()
        return jsonify({"error": "Invalid credentials"}), 401

    if user["account_status"] == ACCOUNT_STATUS_BLOCKED or not bool(user["can_login"]):
        conn.close()
        clear_user_session()
        return jsonify({
            "error": "Your account has been disabled. Contact support.",
            "blocked": True,
            "session_invalidated": True,
        }), 403

    conn.execute("UPDATE users SET last_seen=? WHERE user_id=?", (now(), user["user_id"]))
    conn.commit()
    refreshed_user = conn.execute("SELECT * FROM users WHERE user_id=?", (user["user_id"],)).fetchone()

    login_user_session(dict(refreshed_user))
    payload = build_public_user_payload(conn, refreshed_user, include_phone=True)
    conn.close()

    return jsonify(payload)

@app.post("/api/logout")
def logout():
    clear_user_session()
    session.pop("admin", None)
    session.pop("admin_username", None)
    session.pop("admin_login_at", None)
    return jsonify({"status": "logged_out"})


@app.post("/api/activity")
def activity():
    user, _data, error = require_user_access()
    if error:
        return error

    conn = get_db()
    conn.execute("UPDATE users SET last_seen=? WHERE user_id=?", (now(), user["user_id"]))
    conn.commit()
    conn.close()
    return jsonify({"status": "updated"})


@app.post("/api/me")
def me():
    user, _data, error = require_user_access()
    if error:
        return error

    conn = get_db()
    u = get_user(conn, user["user_id"])
    if not u:
        conn.close()
        return jsonify({"error": "User not found"}), 404

    payload = build_public_user_payload(conn, u, include_phone=True)
    conn.close()

    return jsonify(payload)


@app.post("/api/profile/welcome-popup")
def update_welcome_popup_preference():
    user, data, error = require_user_access()
    if error:
        return error

    hidden = bool((data or {}).get("hidden", True))

    conn = get_db()
    conn.execute(
        "UPDATE users SET welcome_popup_hidden=? WHERE user_id=?",
        (1 if hidden else 0, user["user_id"]),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM users WHERE user_id=?", (user["user_id"],)).fetchone()
    payload = {
        "success": True,
        "welcome_popup_hidden": bool(updated["welcome_popup_hidden"]),
        "show_welcome_popup": not bool(updated["welcome_popup_hidden"]),
    }
    conn.close()
    return jsonify(payload)

@app.get("/api/profile/avatars")
def profile_avatars():
    user, error = require_user_access()
    if error:
        return error

    current_key = normalize_avatar_key(user.get("avatar_key"))
    avatars = [
        {
            "key": key,
            "avatar_url": avatar_url_for_key(key),
            "selected": key == current_key,
        }
        for key in AVATAR_FILENAMES
    ]
    return jsonify({"success": True, "avatars": avatars, "current_avatar_key": current_key, "current_avatar_url": avatar_url_for_key(current_key)})

@app.post("/api/profile/avatar")
def update_profile_avatar():
    user, data, error = require_user_access()
    if error:
        return error

    avatar_key = normalize_avatar_key((data or {}).get("avatar_key"))
    if not avatar_key:
        return jsonify({"error": "Invalid avatar selection."}), 400

    conn = get_db()
    conn.execute("UPDATE users SET avatar_key=? WHERE user_id=?", (avatar_key, user["user_id"]))
    conn.commit()
    updated = conn.execute("SELECT * FROM users WHERE user_id=?", (user["user_id"],)).fetchone()
    payload = build_public_user_payload(conn, updated, include_phone=True)
    conn.close()
    return jsonify({"success": True, "user": payload})

# ======================
# REWARDS
# ======================
@app.post("/api/reward/claim")
def claim_reward():
    user, data, error = require_user_access("tasks")
    if error:
        return error

    user_id = user["user_id"]
    task = data.get("task")
    phase = data.get("phase", 1)

    if not task:
        return jsonify({"error": "Missing task"}), 400

    try:
        phase = int(phase)
    except Exception:
        return jsonify({"error": "Invalid phase"}), 400

    if task not in ALLOWED_TASKS:
        return jsonify({"error": "Invalid task"}), 400

    if phase != 1:
        return jsonify({"error": "Only Phase 1 reward is enabled"}), 400

    conn = get_db()
    u = get_user(conn, user_id)
    if not u:
        conn.close()
        return jsonify({"error": "User not found"}), 404

    existing = conn.execute(
        "SELECT * FROM reward_claims WHERE user_id=? AND task=? AND phase=?",
        (user_id, task, phase)
    ).fetchone()

    if existing:
        conn.close()
        return jsonify({
            "status": "already_claimed",
            "balance": u["balance"],
            "message": "Reward already claimed"
        })

    conn.execute(
        "UPDATE users SET balance = COALESCE(balance,0) + ? WHERE user_id=?",
        (PHASE1_REWARD, user_id)
    )
    conn.execute(
        "INSERT INTO reward_claims (user_id, task, phase, amount, claimed_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, task, phase, PHASE1_REWARD, now())
    )
    conn.commit()

    u2 = get_user(conn, user_id)
    conn.close()

    return jsonify({
        "status": "credited",
        "balance": u2["balance"],
        "amount": PHASE1_REWARD,
        "message": "Reward credited"
    })


# ======================
# PAYSTACK DEPOSITS
# ======================
@app.get("/api/paystack/config")
def paystack_config():
    return jsonify({
        "public_key": PAYSTACK_PUBLIC_KEY,
        "currency": PAYSTACK_CURRENCY,
        "min_deposit": MIN_DEPOSIT_GHS,
        "max_deposit": MAX_DEPOSIT_GHS,
        "callback_url": callback_url(),
        "webhook_url": webhook_url(),
    })


@app.post("/api/paystack/initialize-deposit")
def initialize_paystack_deposit():
    try:
        if not PAYSTACK_SECRET_KEY or not PAYSTACK_PUBLIC_KEY:
            return jsonify({"error": "Paystack keys are missing in .env"}), 500

        user, data, error = require_user_access("deposit")
        if error:
            return error

        user_id = user["user_id"]
        email = (data.get("email") or "").strip().lower()
        amount_ghs = clamp_amount(data.get("amount"))

        if not email:
            return jsonify({"error": "Email is required"}), 400

        if not amount_ghs:
            return jsonify({"error": "Amount is required"}), 400

        if amount_ghs < MIN_DEPOSIT_GHS:
            return jsonify({"error": f"Minimum deposit is {int(MIN_DEPOSIT_GHS)} GHS"}), 400

        if amount_ghs > MAX_DEPOSIT_GHS:
            return jsonify({"error": f"Maximum deposit is {int(MAX_DEPOSIT_GHS)} GHS"}), 400

        amount_subunit = int(round(amount_ghs * 100))

        conn = get_db()
        db_user = get_user(conn, user_id)
        if not db_user:
            conn.close()
            return jsonify({"error": "User not found"}), 404

        save_user_email(conn, user_id, email)
        conn.commit()
        conn.close()

        reference = make_deposit_reference(user_id)

        payload = {
            "email": email,
            "amount": amount_subunit,
            "currency": PAYSTACK_CURRENCY,
            "reference": reference,
        }

        resp = paystack_post("/transaction/initialize", payload)
        print("PAYSTACK INIT RESPONSE:", resp)

        if not resp.get("status"):
            return jsonify({
                "error": resp.get("message", "Failed to initialize transaction"),
                "raw": resp.get("raw", "")
            }), 400

        pdata = resp.get("data") or {}
        access_code = pdata.get("access_code")
        auth_url = pdata.get("authorization_url")

        conn = get_db()
        create_payment_row(conn, reference, user_id, email, amount_ghs, amount_subunit, access_code)
        conn.commit()
        conn.close()

        return jsonify({
            "status": "initialized",
            "reference": reference,
            "access_code": access_code,
            "authorization_url": auth_url,
            "public_key": PAYSTACK_PUBLIC_KEY,
            "amount": amount_ghs,
            "email": email,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Server error: {str(e)}"}), 500


@app.get("/api/paystack/verify/<reference>")
def verify_paystack_reference(reference):
    result = verify_and_credit_reference(reference)
    if not result.get("ok"):
        return jsonify(result), 400
    return jsonify(result)


@app.post("/api/paystack/webhook")
def paystack_webhook():
    if not PAYSTACK_SECRET_KEY:
        return jsonify({"error": "Missing Paystack secret key"}), 500

    signature = request.headers.get("x-paystack-signature", "")
    body = request.get_data()

    computed = hmac.new(
        PAYSTACK_SECRET_KEY.encode("utf-8"),
        body,
        hashlib.sha512
    ).hexdigest()

    if not hmac.compare_digest(signature, computed):
        return jsonify({"error": "Invalid signature"}), 401

    try:
        event = request.get_json(force=True, silent=False)
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    event_name = event.get("event")
    data = event.get("data") or {}
    reference = data.get("reference")

    if event_name == "charge.success" and reference:
        verify_and_credit_reference(reference)

    return jsonify({"status": "received"}), 200


@app.get("/payment/callback")
def payment_callback():
    reference = request.args.get("reference", "")
    trxref = request.args.get("trxref", "")
    ref = reference or trxref

    if ref:
        return redirect(f"/?payment_reference={ref}&payment_returned=1")
    return redirect("/")


@app.get("/api/deposit-history/<user_id>")
def deposit_history(user_id):
    user, _data, error = require_user_access()
    if error:
        return error

    if user["user_id"] != user_id:
        return jsonify({"error": "Forbidden"}), 403

    conn = get_db()
    transactions = get_user_payment_history(conn, user_id)
    conn.close()

    return jsonify(transactions)


# ======================
# MANUAL REQUESTS (WITHDRAWALS ONLY)
# ======================
@app.post("/api/request")
def create_request():
    user, data, error = require_user_access("withdraw")
    if error:
        return error

    request_id = os.urandom(6).hex()
    kind = data.get("kind")
    payload = data.get("payload") or {}
    user_id = user["user_id"]

    if kind not in ("withdrawal",):
        return jsonify({"error": "Only withdrawals are manual now"}), 400

    conn = get_db()
    db_user = get_user(conn, user_id)
    if not db_user:
        conn.close()
        return jsonify({"error": "User not found"}), 404

    conn.execute("""
    INSERT INTO requests (id, kind, user_id, payload, status, created_at, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        request_id,
        kind,
        user_id,
        json.dumps(payload),
        "pending",
        now(),
        None
    ))
    conn.commit()
    conn.close()

    return jsonify({"id": request_id})


@app.get("/api/request/<rid>")
def get_request_status(rid):
    user, _data, error = require_user_access()
    if error:
        return error

    conn = get_db()
    row = conn.execute("SELECT * FROM requests WHERE id=?", (rid,)).fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "Not found"}), 404

    if row["user_id"] != user["user_id"]:
        return jsonify({"error": "Forbidden"}), 403

    return jsonify(dict(row))


# ======================
# ADMIN - CURRENT / OLD ENDPOINTS
# ======================
@app.post("/api/admin/login")
def admin_login():
    data = request.json or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    conn = get_db()
    admin = conn.execute("SELECT * FROM admin WHERE username=?", (username,)).fetchone()
    conn.close()

    if not admin:
        # If admin doesn't exist, maybe credentials in .env are wrong or seed didn't run
        # Return a generic error to avoid leaking info
        return jsonify({"error": "Invalid credentials"}), 401

    if not check_password_hash(admin["password"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    session.permanent = True
    session["admin"] = True
    session["admin_username"] = admin["username"]
    session["admin_login_at"] = now()
    return jsonify({"status": "logged_in", "username": admin["username"]})


@app.get("/api/admin/logout")
def admin_logout():
    session.pop("admin", None)
    session.pop("admin_username", None)
    session.pop("admin_login_at", None)
    return jsonify({"status": "logged_out"})


@app.get("/api/admin/ping")
def admin_ping():
    return jsonify({"admin": require_admin()})


@app.get("/api/admin/deposits")
def admin_deposits():
    if not require_admin():
        return jsonify({"error": "Unauthorized"}), 401

    # Deposits are now automatic, so the old deposits table remains empty.
    return jsonify([])


@app.get("/api/admin/withdrawals")
def admin_withdrawals():
    if not require_admin():
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM requests WHERE kind='withdrawal' AND status='pending' ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows])


@app.get("/api/admin/history")
def admin_history():
    if not require_admin():
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db()

    manual_rows = conn.execute(
        "SELECT * FROM requests WHERE status!='pending' ORDER BY created_at DESC"
    ).fetchall()

    payment_rows = conn.execute("""
        SELECT reference, user_id, email, amount_ghs, channel, status, created_at, paid_at
        FROM payments
        WHERE status != 'initialized'
        ORDER BY created_at DESC
    """).fetchall()

    conn.close()

    merged = [dict(r) for r in manual_rows]

    for r in payment_rows:
        merged.append({
            "id": r["reference"],
            "kind": "deposit",
            "user_id": r["user_id"],
            "payload": json.dumps({
                "email": r["email"],
                "amount": r["amount_ghs"],
                "network": r["channel"],
            }),
            "status": r["status"],
            "created_at": r["created_at"],
            "decided_at": r["paid_at"],
        })

    merged.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return jsonify(merged)


@app.get("/api/admin/users")
def admin_users():
    if not require_admin():
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db()
    rows = conn.execute("""
        SELECT user_id, phone, email, created_at, last_seen, balance
        FROM users
        ORDER BY created_at DESC
    """).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows])


@app.post("/api/admin/decision")
def decision():
    if not require_admin():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json or {}
    rid = data.get("id")
    decision_value = data.get("decision")

    if decision_value not in ("approved", "rejected"):
        return jsonify({"error": "Invalid decision"}), 400

    conn = get_db()
    req = conn.execute("SELECT * FROM requests WHERE id=?", (rid,)).fetchone()
    if not req:
        conn.close()
        return jsonify({"error": "Request not found"}), 404

    if req["status"] != "pending":
        conn.close()
        return jsonify({"error": "Request has already been decided"}), 409

    try:
        payload = json.loads(req["payload"] or "{}")
    except Exception:
        payload = {}

    try:
        amount = clamp_amount(payload.get("amount"))
    except Exception:
        amount = None

    if req["kind"] == "withdrawal":
        if amount is None or amount <= 0:
            conn.close()
            return jsonify({"error": "Withdrawal request payload is invalid."}), 400

        if decision_value == "rejected":
            conn.execute(
                "UPDATE users SET balance = ROUND(COALESCE(balance, 0) + ?, 2) WHERE user_id=?",
                (amount, req["user_id"]),
            )

    conn.execute(
        "UPDATE requests SET status=?, decided_at=? WHERE id=?",
        (decision_value, now(), rid),
    )

    conn.commit()
    conn.close()
    return jsonify({"status": "updated"})


# ======================
# ADMIN - NEW / RICHER ENDPOINTS
# ======================
@app.get("/api/admin/overview")
@admin_api_required
def admin_overview():
    conn = get_db()

    pending_withdrawals = conn.execute(
        "SELECT COUNT(*) AS n FROM requests WHERE kind='withdrawal' AND status='pending'"
    ).fetchone()["n"]

    held_withdrawals = conn.execute(
        "SELECT COUNT(*) AS n FROM requests WHERE kind='withdrawal' AND status='held'"
    ).fetchone()["n"]

    if table_exists(conn, "payment_intents"):
        payments_needing_review = conn.execute(
            """
            SELECT COUNT(*) AS n
            FROM payment_intents
            WHERE status IN ('initialized', 'pending', 'held', 'abandoned', 'expired', 'failed')
            """
        ).fetchone()["n"]
        successful_payments = conn.execute(
            """
            SELECT COUNT(*) AS n
            FROM payment_intents
            WHERE status = 'success' OR verified_at IS NOT NULL
            """
        ).fetchone()["n"]
    else:
        payments_needing_review = conn.execute(
            "SELECT COUNT(*) AS n FROM payments WHERE status IN ('initialized', 'held', 'amount_mismatch', 'rejected')"
        ).fetchone()["n"]
        successful_payments = conn.execute(
            "SELECT COUNT(*) AS n FROM payments WHERE credited_at IS NOT NULL"
        ).fetchone()["n"]

    if table_exists(conn, "manual_payments"):
        expire_pending_manual_payments(conn)
        payments_needing_review += conn.execute(
            "SELECT COUNT(*) AS n FROM manual_payments WHERE status='pending'"
        ).fetchone()["n"]
        successful_payments += conn.execute(
            "SELECT COUNT(*) AS n FROM manual_payments WHERE status='approved'"
        ).fetchone()["n"]

    blocked_users = conn.execute(
        "SELECT COUNT(*) AS n FROM users WHERE account_status='blocked'"
    ).fetchone()["n"]

    flagged_users = conn.execute(
        "SELECT COUNT(*) AS n FROM users WHERE flagged=1 OR account_status='under_review'"
    ).fetchone()["n"]

    conn.close()

    return jsonify({
        "pending_withdrawals": pending_withdrawals,
        "held_withdrawals": held_withdrawals,
        "payments_needing_review": payments_needing_review,
        "successful_payments": successful_payments,
        "blocked_users": blocked_users,
        "flagged_users": flagged_users,
    })


@app.get("/api/admin/users/full")
@admin_api_required
def admin_users_full():
    conn = get_db()
    rows = conn.execute("""
        SELECT
            user_id,
            phone,
            email,
            created_at,
            last_seen,
            balance,
            account_status,
            can_login,
            can_tasks,
            can_deposit,
            can_withdraw,
            flagged,
            session_version,
            restricted_reason,
            blocked_reason,
            review_reason
        FROM users
        ORDER BY created_at DESC
    """).fetchall()

    result = []
    for row in rows:
        user = serialize_user_admin(row)
        level_summary = build_admin_level_summary(conn, user["user_id"])
        user["current_active_level_id"] = level_summary.get("active_level_id")
        user["current_active_level_number"] = level_summary.get("active_level_number")
        user["current_active_level_status"] = level_summary.get("active_level_status")
        result.append(user)

    conn.close()
    return jsonify(result)


@app.get("/api/admin/users/<user_id>")
def admin_user_detail(user_id):
    if not require_admin():
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db()

    user_row = conn.execute(
        "SELECT * FROM users WHERE user_id=?",
        (user_id,),
    ).fetchone()

    if not user_row:
        conn.close()
        return jsonify({"error": "User not found"}), 404

    payments = []
    if table_exists(conn, "payments"):
        payment_rows = conn.execute("""
            SELECT
                reference,
                user_id,
                email,
                amount_ghs,
                status,
                credited_at,
                created_at
            FROM payments
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 5
        """, (user_id,)).fetchall()

        payments = []
        for row in payment_rows:
            item = dict(row)
            item["credited"] = bool(item.get("credited_at"))
            payments.append(item)

    withdrawals = []
    if table_exists(conn, "requests"):
        withdrawal_rows = conn.execute("""
            SELECT *
            FROM requests
            WHERE user_id = ?
              AND kind = 'withdrawal'
            ORDER BY created_at DESC
            LIMIT 5
        """, (user_id,)).fetchall()

        withdrawals = [serialize_admin_withdrawal_row(row) for row in withdrawal_rows]

    notes = []
    if table_exists(conn, "admin_notes"):
        note_rows = conn.execute("""
            SELECT *
            FROM admin_notes
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        """, (user_id,)).fetchall()
        notes = [dict(row) for row in note_rows]

    result = {
        "user": normalize_admin_user_row(user_row),
        "payments": payments,
        "withdrawals": withdrawals,
        "notes": notes,
        "level_summary": build_admin_level_summary(conn, user_id),
    }

    conn.close()
    return jsonify(result)


@app.post("/api/admin/users/<user_id>/status")
@admin_api_required
def admin_user_set_status(user_id):
    data = request.json or {}
    status = (data.get("status") or "").strip()
    reason = (data.get("reason") or "").strip() or None

    try:
        set_user_account_status(
            user_id=user_id,
            status=status,
            reason=reason,
            actor_id=get_admin_actor_id(),
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    conn = get_db()
    user = get_user_admin_state(conn, user_id)
    conn.close()
    return jsonify({"status": "updated", "user": user})


@app.post("/api/admin/users/<user_id>/force-logout")
@admin_api_required
def admin_user_force_logout(user_id):
    data = request.json or {}
    reason = (data.get("reason") or "").strip() or None

    try:
        force_logout_user(
            user_id=user_id,
            actor_id=get_admin_actor_id(),
            reason=reason,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    conn = get_db()
    user = get_user_admin_state(conn, user_id)
    conn.close()
    return jsonify({"status": "updated", "user": user})


@app.post("/api/admin/users/<user_id>/permission")
@admin_api_required
def admin_user_set_permission(user_id):
    data = request.json or {}
    permission_key = (data.get("permission_key") or "").strip()
    allowed = bool(data.get("allowed"))
    reason = (data.get("reason") or "").strip() or None

    try:
        set_user_permission(
            user_id=user_id,
            permission_key=permission_key,
            allowed=allowed,
            actor_id=get_admin_actor_id(),
            reason=reason,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    conn = get_db()
    user = get_user_admin_state(conn, user_id)
    conn.close()
    return jsonify({"status": "updated", "user": user})


@app.get("/api/admin/payments/full")
@admin_api_required
def admin_payments_full():
    conn = get_db()

    rows: list[dict[str, Any]] = []
    seen_refs: set[str] = set()

    if table_exists(conn, "payment_intents"):
        intent_rows = conn.execute("""
            SELECT
                pi.*,
                lc.level_number,
                lc.completion_reward,
                lc.unlock_fee,
                lc.final_stage_fee
            FROM payment_intents pi
            LEFT JOIN level_catalog lc ON lc.id = pi.level_id
            ORDER BY pi.created_at DESC, pi.id DESC
        """).fetchall()

        for row in intent_rows:
            serialized = serialize_admin_payment_intent(row)
            if serialized:
                rows.append(serialized)
                seen_refs.add(str(serialized.get("reference") or ""))

    if table_exists(conn, "payments"):
        legacy_rows = conn.execute("""
            SELECT *
            FROM payments
            ORDER BY created_at DESC, id DESC
        """).fetchall()

        for row in legacy_rows:
            serialized = serialize_admin_legacy_payment(row)
            if not serialized:
                continue
            ref = str(serialized.get("reference") or "")
            if ref and ref in seen_refs:
                continue
            seen_refs.add(ref)
            rows.append(serialized)

    for row in get_admin_manual_payments(conn):
        serialized = serialize_admin_manual_payment(row)
        if not serialized:
            continue
        ref = str(serialized.get("reference") or "")
        if ref and ref in seen_refs:
            continue
        seen_refs.add(ref)
        rows.append(serialized)

    rows.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
    conn.close()

    return jsonify(rows)


@app.post("/api/admin/payments/<reference>/decision")
@admin_api_required
def admin_payment_decision(reference):
    data = request.json or {}
    decision_value = (data.get("decision") or "").strip()
    reason = (data.get("reason") or "").strip() or None
    actor_id = get_admin_actor_id()

    manual_payment = None
    manual_error = None
    conn = get_db()
    try:
        manual_row = None
        if table_exists(conn, "manual_payments"):
            manual_row = conn.execute(
                "SELECT * FROM manual_payments WHERE reference=?",
                (reference,),
            ).fetchone()

        if manual_row:
            if decision_value != "approve":
                manual_error = ValueError("Manual payments only support approval from this action.")
            else:
                manual_payment = approve_manual_payment(
                    conn,
                    reference=reference,
                    approved_by=actor_id,
                    approval_source="dashboard",
                    reason=reason,
                )
                notify_manual_payment_approved(conn, manual_payment)
    except ValueError as e:
        manual_error = e
    finally:
        conn.close()

    if manual_error:
        return jsonify({"error": str(manual_error)}), 400

    if manual_payment:
        return jsonify({
            "status": "updated",
            "payment": serialize_admin_manual_payment(manual_payment),
        })

    try:
        payment = apply_payment_decision(
            reference=reference,
            decision_value=decision_value,
            actor_id=actor_id,
            reason=reason,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify({"status": "updated", "payment": payment})


@app.get("/api/admin/withdrawals/full")
@admin_api_required
def admin_withdrawals_full():
    conn = get_db()
    rows = conn.execute("""
        SELECT *
        FROM requests
        WHERE kind='withdrawal'
        ORDER BY created_at DESC
    """).fetchall()

    result = [serialize_request_admin(conn, r) for r in rows]
    conn.close()
    return jsonify(result)


@app.post("/api/admin/withdrawals/<request_id>/decision")
@admin_api_required
def admin_withdrawal_decision(request_id):
    data = request.json or {}
    decision_value = (data.get("decision") or "").strip()
    reason = (data.get("reason") or "").strip() or None

    try:
        req = apply_withdrawal_decision(
            request_id=request_id,
            decision_value=decision_value,
            actor_id=get_admin_actor_id(),
            reason=reason,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify({"status": "updated", "request": req})


@app.get("/api/admin/risk-flags")
@admin_api_required
def admin_risk_flags():
    conn = get_db()
    rows = conn.execute("""
        SELECT *
        FROM risk_flags
        ORDER BY created_at DESC
    """).fetchall()
    conn.close()

    return jsonify([serialize_risk_flag(r) for r in rows])


@app.post("/api/admin/risk-flags/<int:flag_id>/resolve")
@admin_api_required
def admin_resolve_risk_flag(flag_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM risk_flags WHERE id=?", (flag_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Risk flag not found"}), 404

    conn.execute("""
        UPDATE risk_flags
        SET status='resolved', resolved_by=?, resolved_at=?
        WHERE id=?
    """, (get_admin_actor_id(), now(), flag_id))
    conn.commit()
    conn.close()

    log_audit_event(
        action_group="risk",
        action_type="resolve",
        target_type="risk_flag",
        target_id=str(flag_id),
        summary=f"Resolved risk flag {flag_id}",
        actor_id=get_admin_actor_id(),
    )

    return jsonify({"status": "updated"})


@app.get("/api/admin/audit-logs")
@admin_api_required
def admin_audit_logs():
    conn = get_db()
    rows = conn.execute("""
        SELECT *
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 500
    """).fetchall()
    conn.close()

    return jsonify([serialize_audit_log(r) for r in rows])


@app.get("/api/admin/notes/<user_id>")
@admin_api_required
def admin_notes_list(user_id):
    conn = get_db()
    rows = conn.execute("""
        SELECT *
        FROM admin_notes
        WHERE user_id=?
        ORDER BY created_at DESC
    """, (user_id,)).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows])


@app.post("/api/admin/notes/<user_id>")
@admin_api_required
def admin_notes_create(user_id):
    data = request.json or {}
    note = (data.get("note") or "").strip()

    if not note:
        return jsonify({"error": "Note is required"}), 400

    note_id = add_admin_note(
        user_id=user_id,
        note=note,
        created_by=get_admin_actor_id(),
    )

    log_audit_event(
        action_group="user",
        action_type="add_note",
        target_type="user",
        target_id=user_id,
        summary=f"Added admin note for {user_id}",
        actor_id=get_admin_actor_id(),
    )

    return jsonify({"status": "created", "note_id": note_id})


# ======================
# PAGES
# ======================
@app.get("/")
def serve_index():
    return render_template("index.html")


@app.get("/terms")
def serve_terms():
    return render_template("terms.html", support_email=SUPPORT_EMAIL, public_app_name=PUBLIC_APP_NAME)


@app.get("/privacy")
def serve_privacy():
    return render_template("privacy.html", support_email=SUPPORT_EMAIL, public_app_name=PUBLIC_APP_NAME)


@app.get("/contact")
def serve_contact():
    return render_template(
        "contact.html",
        support_email=SUPPORT_EMAIL,
        support_hours=SUPPORT_HOURS,
        public_app_name=PUBLIC_APP_NAME,
    )


@app.get("/manual-payment/<reference>")
def serve_manual_payment(reference):
    return render_template(
        "manual_payment.html",
        reference=reference,
        account_number=MANUAL_PAYMENT_ACCOUNT_NUMBER,
        account_name=MANUAL_PAYMENT_ACCOUNT_NAME,
        network_type=MANUAL_PAYMENT_NETWORK,
    )


@app.get("/manual-payment-status/<reference>")
def serve_manual_payment_status(reference):
    return render_template(
        "manual_payment_status.html",
        reference=reference,
    )


@app.get("/admin")
@app.get("/admin/")
def serve_admin():
    return render_template("admin.html")


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "false").strip().lower() == "true",
        use_reloader=False,
    )
