-- INJ004-A4-IMPORT-IMPLEMENT-003: Import jobs table for DOCX/ZIP exam import pipeline.
-- Import jobs track upload → inspect → finalize → READY lifecycle.
-- No partial exam tree/READY asset on failure; transaction rollback ensures atomicity.

CREATE TABLE import_jobs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    -- Immutable metadata set at creation.
    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL COMMENT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document or application/zip',
    file_size_bytes BIGINT UNSIGNED NOT NULL,
    -- Domain tags: import media assets are tagged differently from DOCX package content.
    domain_tag VARCHAR(50) NOT NULL DEFAULT 'import-media' COMMENT 'import-media | docx-package (for logging only, never persisted)',
    -- Presigned storage boundary: import media assets go to separate prefix.
    s3_prefix VARCHAR(512) NOT NULL,
    -- Job lifecycle: UPLOADING → INSPECTING → INSPECT_FAILED | FINALIZING → READY | FAILED | CANCELLED
    status VARCHAR(50) NOT NULL DEFAULT 'UPLOADING',
    status_message TEXT,
    -- Inspection result summary (null until inspected).
    inspection_result JSON COMMENT '{valid: bool, warnings: string[], errors: string[], mediaCount: number}',
    -- Actor who created the job.
    actor_user_id INT UNSIGNED NOT NULL,
    -- Exam ID produced by finalize (null until READY).
    -- Signed INT to match toeic_exams.id (001_schema.up.sql: INT AUTO_INCREMENT).
    -- MySQL FK requires identical column type; INT UNSIGNED vs INT raises error 3780.
    produced_exam_id INT NULL,
    -- Soft cleanup: cancel clears content but preserves audit trail.
    cancelled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (produced_exam_id) REFERENCES toeic_exams(id) ON DELETE SET NULL,
    CONSTRAINT chk_import_status CHECK (status IN (
        'UPLOADING', 'INSPECTING', 'INSPECT_FAILED', 'FINALIZING', 'READY', 'FAILED', 'CANCELLED'
    )),
    INDEX idx_status (status),
    INDEX idx_actor (actor_user_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit log for import operations (append-only).
CREATE TABLE import_audit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    import_job_id INT UNSIGNED NOT NULL,
    action VARCHAR(50) NOT NULL COMMENT 'CREATE, INSPECT, FINALIZE, CANCEL, FAIL',
    actor_user_id INT UNSIGNED NOT NULL,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_job_action (import_job_id, action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TRIGGER trg_import_audit_log_before_update
BEFORE UPDATE ON import_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'import_audit_log is append-only: UPDATE is not allowed';

CREATE TRIGGER trg_import_audit_log_before_delete
BEFORE DELETE ON import_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'import_audit_log is append-only: DELETE is not allowed';
