import json
import random
import secrets
import sqlite3
from typing import Any

from services.db_service import fetch_all, fetch_one, now_iso
from utils.enums import TaskStatus

_rng = random.SystemRandom()

HEADLINE_BANK = [
    {
        "headline": "Government unveils new digital ID upgrade",
        "options": ["Politics", "Sports", "Technology", "Health"],
        "answer": "Politics",
    },
    {
        "headline": "Local team secures dramatic late victory",
        "options": ["Politics", "Sports", "Technology", "Health"],
        "answer": "Sports",
    },
    {
        "headline": "Startup launches low-cost solar battery kit",
        "options": ["Politics", "Sports", "Technology", "Health"],
        "answer": "Technology",
    },
    {
        "headline": "Doctors report progress in malaria vaccine rollout",
        "options": ["Politics", "Sports", "Technology", "Health"],
        "answer": "Health",
    },
]

FLAG_BANK = [
    {
        "country": "Ghana",
        "options": ["Ghana", "Kenya", "Cameroon", "Senegal"],
        "answer": "Ghana",
        "hint": "Horizontal red-yellow-green with a black star.",
    },
    {
        "country": "Nigeria",
        "options": ["Nigeria", "Ivory Coast", "Mali", "Ireland"],
        "answer": "Nigeria",
        "hint": "Vertical green-white-green stripes.",
    },
    {
        "country": "France",
        "options": ["France", "Italy", "Russia", "Netherlands"],
        "answer": "France",
        "hint": "Vertical blue-white-red stripes.",
    },
]

CAPTION_BANK = [
    {
        "image_title": "Busy city market",
        "options": [
            "A quiet beach at sunrise",
            "Crowded traders selling goods in a market",
            "A football stadium at night",
            "A snowy mountain peak",
        ],
        "answer": "Crowded traders selling goods in a market",
    },
    {
        "image_title": "Office meeting room",
        "options": [
            "People discussing around a conference table",
            "A family eating dinner outdoors",
            "A train leaving a station",
            "A runner crossing a finish line",
        ],
        "answer": "People discussing around a conference table",
    },
]

DUPLICATE_BANK = [
    {
        "item_a": "Blue ceramic mug",
        "item_b": "Blue ceramic mug",
        "options": ["Yes", "No"],
        "answer": "Yes",
    },
    {
        "item_a": "Red running shoe",
        "item_b": "Black leather wallet",
        "options": ["Yes", "No"],
        "answer": "No",
    },
]

BOOK_BANK = [
    {
        "book_title": "The Silent River",
        "options": [
            "Minimalist river cover",
            "Football action cover",
            "Bright cartoon cover",
            "Dark city skyline cover",
        ],
        "answer": "Minimalist river cover",
    },
    {
        "book_title": "Secrets of the Night Market",
        "options": [
            "A night market with warm lights",
            "A snowy mountain scene",
            "A plain white notebook",
            "A racing car poster",
        ],
        "answer": "A night market with warm lights",
    },
]

RECIPE_BANK = [
    {
        "recipe_name": "Spicy tomato pasta",
        "options": ["Tomato", "Sugar", "Ice", "Bread"],
        "answer": "Tomato",
    },
    {
        "recipe_name": "Citrus fruit salad",
        "options": ["Lemon", "Salt", "Pepper", "Rice"],
        "answer": "Lemon",
    },
]


def _sample_record(category_key: str) -> dict[str, Any]:
    if category_key == "headline_classifier":
        return dict(_rng.choice(HEADLINE_BANK))
    if category_key == "flag_country_match":
        return dict(_rng.choice(FLAG_BANK))
    if category_key == "caption_match":
        return dict(_rng.choice(CAPTION_BANK))
    if category_key == "duplicate_detection":
        return dict(_rng.choice(DUPLICATE_BANK))
    if category_key == "book_cover_match":
        return dict(_rng.choice(BOOK_BANK))
    if category_key == "recipe_ingredient_match":
        return dict(_rng.choice(RECIPE_BANK))

    return {
        "prompt": "Complete the task carefully.",
        "options": ["A", "B", "C", "D"],
        "answer": "A",
    }


def _build_task_payload(
    category_key: str,
    display_name: str,
    source_type: str,
    level_number: int,
    task_slot: int,
    *,
    is_free_task: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    record = _sample_record(category_key)

    payload = {
        "category_key": category_key,
        "display_name": display_name,
        "source_type": source_type,
        "level_number": level_number,
        "task_slot": task_slot,
        "is_free_task": is_free_task,
        "content": record,
    }

    expected_answer_ref = {
        "correct_answer": record["answer"],
    }

    return payload, expected_answer_ref


def ensure_user_level_tasks_assigned(
    conn: sqlite3.Connection,
    user_id: str,
    level_id: int,
    user_level_id: int,
) -> list[dict[str, Any]]:
    existing_tasks = fetch_all(
        conn,
        """
        SELECT *
        FROM user_level_tasks
        WHERE user_level_id = ?
        ORDER BY task_slot ASC
        """,
        (user_level_id,),
    )
    if existing_tasks:
        return existing_tasks

    level = fetch_one(
        conn,
        """
        SELECT *
        FROM level_catalog
        WHERE id = ?
        """,
        (level_id,),
    )
    if not level:
        raise ValueError("Level not found while assigning tasks.")

    categories = fetch_all(
        conn,
        """
        SELECT *
        FROM task_category_catalog
        WHERE is_active = 1
        ORDER BY id ASC
        """
    )
    if len(categories) < 1:
        raise ValueError("No active task categories seeded.")

    timestamp = now_iso()
    task_count = int(level["total_task_count"] or 0)
    base_count = int(level["base_task_count"] or 0)
    final_stage_enabled = int(level["final_stage_enabled"] or 0)
    is_free_task_level = float(level["unlock_fee"] or 0) <= 0

    if task_count <= 0:
        task_count = 1

    if len(categories) < task_count:
        raise ValueError("Not enough active task categories seeded.")

    selected_categories = _rng.sample(categories, task_count)

    for idx, category in enumerate(selected_categories, start=1):
        is_final_stage_task = int(final_stage_enabled == 1 and idx > base_count)

        payload, expected_answer_ref = _build_task_payload(
            category_key=category["category_key"],
            display_name=category["display_name"],
            source_type=category["source_type"],
            level_number=level["level_number"],
            task_slot=idx,
            is_free_task=is_free_task_level,
        )

        initial_status = (
            TaskStatus.LOCKED.value
            if is_final_stage_task
            else TaskStatus.ASSIGNED.value
        )

        conn.execute(
            """
            INSERT INTO user_level_tasks (
                user_id,
                level_id,
                user_level_id,
                category_id,
                task_slot,
                status,
                is_final_stage_task,
                task_payload,
                expected_answer_ref,
                verification_token,
                submission_count,
                assigned_at,
                started_at,
                completed_at,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                level_id,
                user_level_id,
                category["id"],
                idx,
                initial_status,
                is_final_stage_task,
                json.dumps(payload),
                json.dumps(expected_answer_ref),
                secrets.token_urlsafe(24),
                0,
                timestamp,
                None,
                None,
                timestamp,
                timestamp,
            ),
        )

    conn.commit()

    return fetch_all(
        conn,
        """
        SELECT *
        FROM user_level_tasks
        WHERE user_level_id = ?
        ORDER BY task_slot ASC
        """,
        (user_level_id,),
    )


def activate_base_tasks(
    conn: sqlite3.Connection,
    user_level_id: int,
) -> None:
    timestamp = now_iso()
    conn.execute(
        """
        UPDATE user_level_tasks
        SET
            status = ?,
            updated_at = ?
        WHERE user_level_id = ?
          AND is_final_stage_task = 0
          AND status = ?
        """,
        (
            TaskStatus.AVAILABLE.value,
            timestamp,
            user_level_id,
            TaskStatus.ASSIGNED.value,
        ),
    )
    conn.commit()


def unlock_final_stage_tasks(
    conn: sqlite3.Connection,
    user_level_id: int,
) -> None:
    timestamp = now_iso()
    conn.execute(
        """
        UPDATE user_level_tasks
        SET
            status = ?,
            updated_at = ?
        WHERE user_level_id = ?
          AND is_final_stage_task = 1
          AND status = ?
        """,
        (
            TaskStatus.AVAILABLE.value,
            timestamp,
            user_level_id,
            TaskStatus.LOCKED.value,
        ),
    )
    conn.commit()


def get_visible_tasks_for_level(
    conn: sqlite3.Connection,
    user_level_id: int,
    include_final_stage_tasks: bool = False,
) -> list[dict[str, Any]]:
    if include_final_stage_tasks:
        return fetch_all(
            conn,
            """
            SELECT ult.*, tcc.category_key, tcc.display_name, tcc.source_type
            FROM user_level_tasks ult
            JOIN task_category_catalog tcc ON tcc.id = ult.category_id
            WHERE ult.user_level_id = ?
            ORDER BY ult.task_slot ASC
            """,
            (user_level_id,),
        )

    return fetch_all(
        conn,
        """
        SELECT ult.*, tcc.category_key, tcc.display_name, tcc.source_type
        FROM user_level_tasks ult
        JOIN task_category_catalog tcc ON tcc.id = ult.category_id
        WHERE ult.user_level_id = ?
          AND ult.is_final_stage_task = 0
        ORDER BY ult.task_slot ASC
        """,
        (user_level_id,),
    )