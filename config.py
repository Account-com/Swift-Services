from pathlib import Path
from typing import Final
import os

from dotenv import load_dotenv

BASE_DIR: Final[Path] = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

ADMIN_USERNAME: Final[str] = os.getenv("ADMIN_USER", "").strip()
ADMIN_PASSWORD: Final[str] = os.getenv("ADMIN_PASS", "").strip()

# Validate admin credentials exist (will crash early if missing)
if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    raise RuntimeError(
        "ADMIN_USER and ADMIN_PASS must be set in .env file. "
        "Create .env from .env.example and fill in the values."
    )

DATABASE_PATH: Final[Path] = Path(os.getenv("DATABASE_PATH") or (BASE_DIR / "database.db"))

PAYMENT_PROVIDER: Final[str] = "paystack"
PAYMENT_CURRENCY: Final[str] = "GHS"
MIN_WITHDRAWAL_AMOUNT: Final[float] = 50.0
MIN_RETAINED_BALANCE: Final[float] = 50.0

PAYSTACK_SECRET_KEY: Final[str] = (
    os.getenv("PAYSTACK_SECRET_KEY")
    or os.getenv("paystack_secret_test_key")
    or os.getenv("PAYSTACK_SECRET_TEST_KEY")
    or ""
).strip()

PAYSTACK_PUBLIC_KEY: Final[str] = (
    os.getenv("PAYSTACK_PUBLIC_KEY")
    or os.getenv("paystack_public_test_key")
    or os.getenv("PAYSTACK_PUBLIC_TEST_KEY")
    or ""
).strip()

PAYSTACK_CALLBACK_URL: Final[str] = os.getenv("PAYSTACK_CALLBACK_URL", "").strip()
PAYSTACK_ALLOWED_CHANNELS: Final[list[str]] = []
PAYSTACK_SUBUNIT_MULTIPLIER: Final[int] = 100

AVATAR_PATH_PREFIX: Final[str] = "/static/images/avatars/"
AVATAR_FILENAMES: Final[list[str]] = [
    "avataaars.svg",
    "avataaars(1).svg",
    "avataaars(2).svg",
    "avataaars(3).svg",
    "avataaars(4).svg",
    "avataaars(5).svg",
    "avataaars(6).svg",
    "avataaars(7).svg",
    "avataaars(8).svg",
    "avataaars(9).svg",
    "avataaars(10).svg",
    "avataaars(11).svg",
    "avataaars(12).svg",
    "avataaars(13).svg",
    "avataaars(14).svg",
    "avataaars(15).svg",
    "avataaars(16).svg",
    "avataaars(17).svg",
    "avataaars(18).svg",
]

TASK_CATEGORIES = [
    {
        "category_key": "headline_classifier",
        "display_name": "Headline Classifier",
        "source_type": "semi_dynamic_api",
    },
    {
        "category_key": "flag_country_match",
        "display_name": "Flag / Country Match",
        "source_type": "semi_dynamic_api",
    },
    {
        "category_key": "caption_match",
        "display_name": "Caption Match",
        "source_type": "native",
    },
    {
        "category_key": "duplicate_detection",
        "display_name": "Duplicate Detection",
        "source_type": "native",
    },
    {
        "category_key": "book_cover_match",
        "display_name": "Book Cover Match",
        "source_type": "semi_dynamic_api",
    },
    {
        "category_key": "recipe_ingredient_match",
        "display_name": "Recipe Ingredient Match",
        "source_type": "semi_dynamic_api",
    },
]

LEVEL_CATALOG = [
    {
        "level_number": 1,
        "unlock_fee": 50.0,
        "final_stage_fee": 0.0,
        "completion_reward": 115.0,
        "base_task_count": 4,
        "total_task_count": 4,
        "final_stage_enabled": 0,
    },
    {
        "level_number": 2,
        "unlock_fee": 70.0,
        "final_stage_fee": 0.0,
        "completion_reward": 161.0,
        "base_task_count": 4,
        "total_task_count": 4,
        "final_stage_enabled": 0,
    },
    {
        "level_number": 3,
        "unlock_fee": 90.0,
        "final_stage_fee": 0.0,
        "completion_reward": 207.0,
        "base_task_count": 4,
        "total_task_count": 4,
        "final_stage_enabled": 0,
    },
    {
        "level_number": 4,
        "unlock_fee": 120.0,
        "final_stage_fee": 30.0,
        "completion_reward": 276.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 5,
        "unlock_fee": 160.0,
        "final_stage_fee": 35.0,
        "completion_reward": 368.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 6,
        "unlock_fee": 200.0,
        "final_stage_fee": 40.0,
        "completion_reward": 460.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 7,
        "unlock_fee": 250.0,
        "final_stage_fee": 45.0,
        "completion_reward": 575.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 8,
        "unlock_fee": 300.0,
        "final_stage_fee": 50.0,
        "completion_reward": 690.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 9,
        "unlock_fee": 400.0,
        "final_stage_fee": 60.0,
        "completion_reward": 1495.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 10,
        "unlock_fee": 500.0,
        "final_stage_fee": 70.0,
        "completion_reward": 1150.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 11,
        "unlock_fee": 650.0,
        "final_stage_fee": 80.0,
        "completion_reward": 920.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 12,
        "unlock_fee": 800.0,
        "final_stage_fee": 90.0,
        "completion_reward": 1840.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 13,
        "unlock_fee": 1000.0,
        "final_stage_fee": 100.0,
        "completion_reward": 2300.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 14,
        "unlock_fee": 1200.0,
        "final_stage_fee": 120.0,
        "completion_reward": 2760.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
    {
        "level_number": 15,
        "unlock_fee": 1500.0,
        "final_stage_fee": 150.0,
        "completion_reward": 3450.0,
        "base_task_count": 4,
        "total_task_count": 6,
        "final_stage_enabled": 1,
    },
]

TOTAL_LEVELS: Final[int] = len(LEVEL_CATALOG)
LEVEL_LOOKUP_BY_NUMBER = {level["level_number"]: level for level in LEVEL_CATALOG}
TASK_CATEGORY_LOOKUP = {category["category_key"]: category for category in TASK_CATEGORIES}