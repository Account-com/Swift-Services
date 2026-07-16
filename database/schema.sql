PRAGMA foreign_keys = ON;

-- =========================================================
-- EXISTING / CORE TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE,
    phone TEXT UNIQUE,
    password TEXT,
    balance REAL DEFAULT 0,
    email TEXT,
    full_name TEXT,
    contact_email TEXT,
    payment_email TEXT,
    current_active_level_id INTEGER,
    welcome_popup_hidden INTEGER NOT NULL DEFAULT 0,
    avatar_key TEXT,
    created_at TEXT,
    last_seen TEXT
);

CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
);

CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    kind TEXT,
    user_id TEXT,
    payload TEXT,
    status TEXT,
    created_at TEXT,
    decided_at TEXT
);

CREATE TABLE IF NOT EXISTS reward_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    task TEXT,
    phase INTEGER,
    amount REAL,
    claimed_at TEXT,
    UNIQUE(user_id, task, phase)
);

-- =========================================================
-- NEW LEVEL SYSTEM TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS level_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level_number INTEGER NOT NULL UNIQUE,
    unlock_fee REAL NOT NULL,
    final_stage_fee REAL NOT NULL DEFAULT 0,
    completion_reward REAL NOT NULL,
    base_task_count INTEGER NOT NULL,
    total_task_count INTEGER NOT NULL,
    final_stage_enabled INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_category_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    level_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'locked',
    unlock_payment_status TEXT NOT NULL DEFAULT 'pending',
    is_started INTEGER NOT NULL DEFAULT 0,
    is_completed INTEGER NOT NULL DEFAULT 0,
    final_stage_unlocked INTEGER NOT NULL DEFAULT 0,
    final_stage_payment_status TEXT NOT NULL DEFAULT 'pending',
    base_tasks_completed_count INTEGER NOT NULL DEFAULT 0,
    total_tasks_completed_count INTEGER NOT NULL DEFAULT 0,
    reward_credited INTEGER NOT NULL DEFAULT 0,
    unlocked_at TEXT,
    started_at TEXT,
    final_stage_unlocked_at TEXT,
    completed_at TEXT,
    last_activity_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, level_id),
    FOREIGN KEY(level_id) REFERENCES level_catalog(id)
);

CREATE TABLE IF NOT EXISTS user_level_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    level_id INTEGER NOT NULL,
    user_level_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    task_slot INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'assigned',
    is_final_stage_task INTEGER NOT NULL DEFAULT 0,
    task_payload TEXT NOT NULL,
    expected_answer_ref TEXT,
    verification_token TEXT NOT NULL UNIQUE,
    submission_count INTEGER NOT NULL DEFAULT 0,
    assigned_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, level_id, task_slot),
    FOREIGN KEY(user_level_id) REFERENCES user_levels(id),
    FOREIGN KEY(category_id) REFERENCES task_category_catalog(id)
);

CREATE TABLE IF NOT EXISTS payment_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    level_id INTEGER NOT NULL,
    payment_type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GHS',
    reference TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'paystack',
    provider_access_code TEXT,
    status TEXT NOT NULL DEFAULT 'initialized',
    provider_response_raw TEXT,
    verified_at TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(level_id) REFERENCES level_catalog(id)
);

CREATE TABLE IF NOT EXISTS manual_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    full_name TEXT,
    email TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'manual',
    network_type TEXT NOT NULL DEFAULT 'MTN',
    phone_number TEXT,
    account_number TEXT,
    account_name TEXT,
    level_id INTEGER NOT NULL,
    level_number INTEGER,
    payment_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_started_at TEXT,
    expires_at TEXT NOT NULL,
    approved_at TEXT,
    approved_by TEXT,
    failed_at TEXT,
    expired_at TEXT,
    expired_by TEXT,
    failure_reason TEXT,
    cancelled_at TEXT,
    cancelled_by TEXT,
    cancellation_reason TEXT,
    approval_source TEXT,
    admin_action_metadata TEXT,
    telegram_message_id TEXT,
    telegram_notified_at TEXT,
    telegram_notification_status TEXT,
    telegram_notification_error TEXT,
    telegram_approved_notified_at TEXT,
    telegram_cancel_notified_at TEXT,
    telegram_last_update_at TEXT,
    FOREIGN KEY(level_id) REFERENCES level_catalog(id)
);

CREATE TABLE IF NOT EXISTS task_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    level_id INTEGER NOT NULL,
    user_level_task_id INTEGER NOT NULL,
    verification_token TEXT NOT NULL,
    submitted_answer TEXT NOT NULL,
    result TEXT NOT NULL,
    ip_address TEXT,
    submitted_at TEXT NOT NULL,
    FOREIGN KEY(user_level_task_id) REFERENCES user_level_tasks(id)
);

CREATE TABLE IF NOT EXISTS activity_feed_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    level_id INTEGER,
    event_type TEXT NOT NULL,
    task_category_key TEXT,
    masked_display_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(level_id) REFERENCES level_catalog(id)
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_user_levels_user_status
ON user_levels(user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_levels_user_level
ON user_levels(user_id, level_id);

CREATE INDEX IF NOT EXISTS idx_user_level_tasks_user_level_status
ON user_level_tasks(user_id, level_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_intents_reference
ON payment_intents(reference);

CREATE INDEX IF NOT EXISTS idx_payment_intents_user_level_type_status
ON payment_intents(user_id, level_id, payment_type, status);

CREATE INDEX IF NOT EXISTS idx_manual_payments_reference
ON manual_payments(reference);

CREATE INDEX IF NOT EXISTS idx_manual_payments_status
ON manual_payments(status);

CREATE INDEX IF NOT EXISTS idx_manual_payments_user_transaction
ON manual_payments(user_id, level_id, payment_type, status);

CREATE INDEX IF NOT EXISTS idx_task_submissions_task_time
ON task_submissions(user_level_task_id, submitted_at);

CREATE INDEX IF NOT EXISTS idx_activity_feed_created_at
ON activity_feed_events(created_at);
