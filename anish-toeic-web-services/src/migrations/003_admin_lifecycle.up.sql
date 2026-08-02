-- INJ004-A3-ADMIN-BE-001: DB-authoritative ADMIN RBAC, append-only audit,
-- publish/archive with immutable JSON snapshot and monotonic versioning.

CREATE TABLE admin_users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'ADMIN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_admin_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE toeic_exams
    ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT, PUBLISHED, ARCHIVED',
    ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Monotonic version for optimistic locking',
    ADD COLUMN published_version INT UNSIGNED NULL COMMENT 'Pointer to the published snapshot version';

ALTER TABLE toeic_exams
    ADD CONSTRAINT chk_exam_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));

CREATE TABLE exam_snapshots (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NOT NULL,
    version INT UNSIGNED NOT NULL,
    snapshot JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES toeic_exams(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_exam_version (exam_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE exam_audit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NOT NULL,
    action VARCHAR(50) NOT NULL COMMENT 'PUBLISH, ARCHIVE',
    actor_user_id INT UNSIGNED NOT NULL,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES toeic_exams(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_exam_action (exam_id, action),
    INDEX idx_actor (actor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TRIGGER trg_exam_audit_log_before_update
BEFORE UPDATE ON exam_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'exam_audit_log is append-only: UPDATE is not allowed';

CREATE TRIGGER trg_exam_audit_log_before_delete
BEFORE DELETE ON exam_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'exam_audit_log is append-only: DELETE is not allowed';
