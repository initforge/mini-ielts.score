-- INJ004-A3-ADMIN-MIXED-RESULTS-001: Admin capabilities, mixed exam composition,
-- capability-based result operations, idempotency, and audit.

-- Admin role/capability system: separate from basic admin_users.
CREATE TABLE admin_roles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO admin_roles (name, description) VALUES
    ('ADMIN', 'Full admin access'),
    ('EXAM_EDITOR', 'Can create and edit exams'),
    ('RESULT_MANAGER', 'Can view and modify results'),
    ('AUDITOR', 'Read-only access to audit logs');

-- Link users to specific capabilities (many-to-many via admin_roles).
CREATE TABLE admin_user_roles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    role_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_user_role (user_id, role_id),
    INDEX idx_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Mixed exam composition: combines multiple published exam sources.
-- Only PUBLISHED exams can be used as sources; sources are ordered deterministically.
CREATE TABLE mixed_exam_sources (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mixed_exam_id INT NOT NULL COMMENT 'Owner mixed exam FK',
    source_exam_id INT NOT NULL COMMENT 'Published exam being referenced',
    source_version INT UNSIGNED NOT NULL COMMENT 'Pinned version at creation',
    order_index INT UNSIGNED NOT NULL COMMENT 'Deterministic ordering',
    section_mapping JSON COMMENT 'Optional: which sections to include',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_exam_id) REFERENCES toeic_exams(id) ON DELETE RESTRICT,
    UNIQUE KEY uniq_mixed_source (mixed_exam_id, source_exam_id, source_version),
    INDEX idx_mixed_exam (mixed_exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE toeic_exams
    ADD COLUMN is_mixed BOOLEAN DEFAULT FALSE COMMENT 'True if this exam is a mixed composition';

-- Idempotency key storage for result operations.
CREATE TABLE result_idempotency_keys (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    attempt_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    result_hash VARCHAR(64) NOT NULL COMMENT 'SHA-256 of result state for deduplication',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attempt_id) REFERENCES toeic_attempts(id) ON DELETE CASCADE,
    INDEX idx_key_expires (idempotency_key, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Store the snapshot used for a specific attempt at grading time.
ALTER TABLE toeic_attempts
    ADD COLUMN grading_snapshot_version INT UNSIGNED NULL COMMENT 'Snapshot version used for grading this attempt';

-- Audit log for mixed exam operations.
CREATE TABLE mixed_exam_audit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mixed_exam_id INT NOT NULL,
    action VARCHAR(50) NOT NULL COMMENT 'CREATE, PUBLISH, UPDATE_SOURCES, ARCHIVE',
    actor_user_id INT UNSIGNED NOT NULL,
    previous_sources JSON,
    new_sources JSON,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mixed_exam_id) REFERENCES toeic_exams(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_mixed_action (mixed_exam_id, action),
    INDEX idx_actor (actor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TRIGGER trg_mixed_exam_audit_log_before_update
BEFORE UPDATE ON mixed_exam_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'mixed_exam_audit_log is append-only: UPDATE is not allowed';

CREATE TRIGGER trg_mixed_exam_audit_log_before_delete
BEFORE DELETE ON mixed_exam_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'mixed_exam_audit_log is append-only: DELETE is not allowed';
