import re
import sqlite3
from typing import Any


PAYMENT_EMAIL_POOL = [
    "danny700218+1@gmail.com",
    "danny700218+2@gmail.com",
    "danny700218+3@gmail.com",
    "danny700218+4@gmail.com",
    "danny700218+5@gmail.com",
    "danny700218+6@gmail.com",
    "danny700218+7@gmail.com",
    "danny700218+8@gmail.com",
    "danny700218+9@gmail.com",
    "danny700218+10@gmail.com",
    "danny700218+30@gmail.com",
    "danny700218+31@gmail.com",
    "danny700218+32@gmail.com",
    "danny700218+33@gmail.com",
    "danny700218+34@gmail.com",
    "danny700218+35@gmail.com",
    "danny700218+36@gmail.com",
    "danny700218+37@gmail.com",
    "danny700218+38@gmail.com",
    "danny700218+39@gmail.com",
    "bridgetfegerson+1@gmail.com",
    "bridgetfegerson+2@gmail.com",
    "bridgetfegerson+3@gmail.com",
    "bridgetfegerson+4@gmail.com",
    "bridgetfegerson+5@gmail.com",
    "bridgetfegerson+6@gmail.com",
    "bridgetfegerson+7@gmail.com",
    "bridgetfegerson+8@gmail.com",
    "bridgetfegerson+9@gmail.com",
    "bridgetfegerson+10@gmail.com",
    "bridgetfegerson+20@gmail.com",
    "bridgetfegerson+21@gmail.com",
    "bridgetfegerson+22@gmail.com",
    "bridgetfegerson+23@gmail.com",
    "bridgetfegerson+24@gmail.com",
    "bridgetfegerson+25@gmail.com",
    "bridgetfegerson+26@gmail.com",
    "bridgetfegerson+27@gmail.com",
    "bridgetfegerson+28@gmail.com",
    "bridgetfegerson+29@gmail.com",
    "jasonfegurson+20@gmail.com",
    "jasonfegurson+21@gmail.com",
    "jasonfegurson+22@gmail.com",
    "jasonfegurson+23@gmail.com",
    "jasonfegurson+24@gmail.com",
    "jasonfegurson+25@gmail.com",
    "jasonfegurson+26@gmail.com",
    "jasonfegurson+27@gmail.com",
    "jasonfegurson+28@gmail.com",
    "jasonfegurson+29@gmail.com",
]

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: Any) -> str:
    return str(value or "").strip().lower()


def is_valid_contact_email(value: Any) -> bool:
    return bool(EMAIL_PATTERN.match(normalize_email(value)))


def payment_email_for_index(index: int) -> str:
    safe_index = max(int(index or 1), 1)
    return PAYMENT_EMAIL_POOL[(safe_index - 1) % len(PAYMENT_EMAIL_POOL)]


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return bool(row)


def ensure_user_email_columns(conn: sqlite3.Connection) -> None:
    if not table_exists(conn, "users"):
        return
    if not column_exists(conn, "users", "contact_email"):
        conn.execute("ALTER TABLE users ADD COLUMN contact_email TEXT")
    if not column_exists(conn, "users", "payment_email"):
        conn.execute("ALTER TABLE users ADD COLUMN payment_email TEXT")


def assign_payment_email_for_new_user(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT MAX(id) AS max_id FROM users").fetchone()
    next_id = int(row["max_id"] or 0) + 1 if row else 1
    return payment_email_for_index(next_id)


def backfill_user_email_fields(conn: sqlite3.Connection) -> None:
    ensure_user_email_columns(conn)
    if not table_exists(conn, "users"):
        return

    rows = conn.execute(
        """
        SELECT id, user_id, email, contact_email, payment_email
        FROM users
        ORDER BY id ASC
        """
    ).fetchall()

    for row in rows:
        contact_email = normalize_email(row["contact_email"] or row["email"]) or None
        payment_email = normalize_email(row["payment_email"]) or payment_email_for_index(row["id"] or 1)
        conn.execute(
            """
            UPDATE users
            SET
                contact_email = COALESCE(NULLIF(TRIM(contact_email), ''), ?),
                payment_email = COALESCE(NULLIF(TRIM(payment_email), ''), ?),
                email = COALESCE(NULLIF(TRIM(email), ''), ?)
            WHERE user_id = ?
            """,
            (contact_email, payment_email, contact_email, row["user_id"]),
        )


def get_user_contact_email(conn: sqlite3.Connection, user_id: str) -> str | None:
    ensure_user_email_columns(conn)
    row = conn.execute(
        """
        SELECT contact_email, email
        FROM users
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if not row:
        return None
    return normalize_email(row["contact_email"] or row["email"]) or None


def save_user_contact_email(conn: sqlite3.Connection, user_id: str, email: str) -> str:
    clean_email = normalize_email(email)
    if not is_valid_contact_email(clean_email):
        raise ValueError("A valid contact email is required before your first payment.")

    ensure_user_email_columns(conn)
    conn.execute(
        """
        UPDATE users
        SET contact_email = ?, email = ?
        WHERE user_id = ?
        """,
        (clean_email, clean_email, user_id),
    )
    conn.commit()
    return clean_email


def ensure_user_payment_email(conn: sqlite3.Connection, user_id: str) -> str:
    ensure_user_email_columns(conn)
    row = conn.execute(
        """
        SELECT id, payment_email
        FROM users
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if not row:
        raise ValueError("User not found.")

    payment_email = normalize_email(row["payment_email"])
    if payment_email:
        return payment_email

    payment_email = payment_email_for_index(row["id"] or 1)
    conn.execute(
        "UPDATE users SET payment_email = ? WHERE user_id = ?",
        (payment_email, user_id),
    )
    conn.commit()
    return payment_email
