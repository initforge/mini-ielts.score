-- INJ004-A3-ADMIN-MIXED-RESULTS-001: Rollback admin capabilities mixed results migration.

DROP TRIGGER IF EXISTS trg_mixed_exam_audit_log_before_update;
DROP TRIGGER IF EXISTS trg_mixed_exam_audit_log_before_delete;
DROP TABLE IF EXISTS mixed_exam_audit_log;
DROP TABLE IF EXISTS result_idempotency_keys;
ALTER TABLE toeic_attempts DROP COLUMN grading_snapshot_version;
ALTER TABLE toeic_exams DROP COLUMN is_mixed;
DROP TABLE IF EXISTS mixed_exam_sources;
DROP TABLE IF EXISTS admin_user_roles;
DROP TABLE IF EXISTS admin_roles;
