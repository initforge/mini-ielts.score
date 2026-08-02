-- INJ004-A3-EXECUTION-SNAPSHOT-BINDING-001: Pin attempts to immutable published snapshots,
-- expectedVersion optimistic locking, RESTORE support, and 409 stale protection.

-- Bind attempts to the exact published snapshot version at creation time.
-- Existing attempts that predate this column get NULL (legacy resolution falls back to current published_version).
ALTER TABLE toeic_attempts
    ADD COLUMN pinned_snapshot_version INT UNSIGNED NULL COMMENT 'Immutable snapshot version bound at attempt creation';

-- Composite unique constraint: an exam version can only be pinned once per user (prevent duplicate attempts on same version).
-- ponytail: add attempt limit policy when capacity grows beyond simple uniqueness.
ALTER TABLE toeic_attempts
    ADD CONSTRAINT uniq_user_exam_version UNIQUE (user_id, exam_id, pinned_snapshot_version);

-- Audit table for result mutations: regrade, override, restore.
-- Append-only: no UPDATE/DELETE allowed.
CREATE TABLE result_audit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    attempt_id INT NOT NULL,
    action VARCHAR(50) NOT NULL COMMENT 'REGRADE, OVERRIDE, RESTORE',
    actor_user_id INT UNSIGNED NOT NULL,
    previous_snapshot_version INT UNSIGNED NULL,
    new_snapshot_version INT UNSIGNED NULL,
    previous_scores JSON,
    new_scores JSON,
    reason TEXT,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attempt_id) REFERENCES toeic_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_attempt_action (attempt_id, action),
    INDEX idx_actor (actor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TRIGGER trg_result_audit_log_before_update
BEFORE UPDATE ON result_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'result_audit_log is append-only: UPDATE is not allowed';

CREATE TRIGGER trg_result_audit_log_before_delete
BEFORE DELETE ON result_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'result_audit_log is append-only: DELETE is not allowed';
