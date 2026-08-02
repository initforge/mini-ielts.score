-- INJ004-A3-ADMIN-BE-001 rollback.

DROP TRIGGER IF EXISTS trg_exam_audit_log_before_delete;
DROP TRIGGER IF EXISTS trg_exam_audit_log_before_update;
DROP TABLE IF EXISTS exam_audit_log;
DROP TABLE IF EXISTS exam_snapshots;
ALTER TABLE toeic_exams DROP COLUMN published_version, DROP COLUMN version, DROP COLUMN status;
DROP TABLE IF EXISTS admin_users;
