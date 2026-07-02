from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from config import DATABASE_PATH  # noqa: E402

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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def seed_bonus_tasks() -> None:
    timestamp = now_iso()

    with get_connection() as conn:
        conn.execute(
            """
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
            """
        )

        conn.execute(
            """
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
            """
        )

        for bonus_task in BONUS_TASK_SEED_DATA:
            conn.execute(
                """
                INSERT INTO bonus_task_catalog (
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
                ON CONFLICT(task_key) DO UPDATE SET
                    title = excluded.title,
                    category_key = excluded.category_key,
                    description = excluded.description,
                    task_payload_json = excluded.task_payload_json,
                    reward = excluded.reward,
                    sort_order = excluded.sort_order,
                    is_active = 1
                """,
                (
                    bonus_task["task_key"],
                    bonus_task["title"],
                    bonus_task["category_key"],
                    bonus_task["description"],
                    json.dumps(bonus_task["payload"], ensure_ascii=False),
                    float(bonus_task["reward"]),
                    int(bonus_task["sort_order"]),
                    timestamp,
                ),
            )

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_bonus_task_catalog_active_sort ON bonus_task_catalog(is_active, sort_order, id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_bonus_tasks_user_status ON user_bonus_tasks(user_id, status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_bonus_tasks_user_task ON user_bonus_tasks(user_id, bonus_task_id)"
        )
        conn.commit()

    print("Bonus tasks seeded successfully.")


if __name__ == "__main__":
    seed_bonus_tasks()
