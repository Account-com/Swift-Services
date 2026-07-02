from enum import Enum


class BaseTextEnum(str, Enum):
    @classmethod
    def values(cls) -> list[str]:
        return [item.value for item in cls]


class UserLevelStatus(BaseTextEnum):
    LOCKED = "locked"
    UNLOCKED_IDLE = "unlocked_idle"
    ACTIVE_BASE = "active_base"
    ACTIVE_FINAL_STAGE_PENDING = "active_final_stage_pending"
    ACTIVE_FINAL_STAGE_OPEN = "active_final_stage_open"
    COMPLETED = "completed"


class PaymentType(BaseTextEnum):
    LEVEL_UNLOCK = "level_unlock"
    FINAL_STAGE_UNLOCK = "final_stage_unlock"


class PaymentStatus(BaseTextEnum):
    INITIALIZED = "initialized"
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    ABANDONED = "abandoned"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class TaskStatus(BaseTextEnum):
    ASSIGNED = "assigned"
    AVAILABLE = "available"
    LOCKED = "locked"
    STARTED = "started"
    COMPLETED = "completed"


class SubmissionResult(BaseTextEnum):
    CORRECT = "correct"
    INCORRECT = "incorrect"
    REJECTED = "rejected"


class WithdrawalRequestStatus(BaseTextEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ActivityEventType(BaseTextEnum):
    LEVEL_UNLOCKED = "level_unlocked"
    LEVEL_STARTED = "level_started"
    TASK_COMPLETED = "task_completed"
    FINAL_STAGE_UNLOCKED = "final_stage_unlocked"
    LEVEL_COMPLETED = "level_completed"
    WITHDRAWAL_REQUESTED = "withdrawal_requested"
    WITHDRAWAL_APPROVED = "withdrawal_approved"
    WITHDRAWAL_REJECTED = "withdrawal_rejected"
