-- INJ004-A3-EXECUTION-SNAPSHOT-BINDING-001: Rollback execution snapshot binding migration.

DROP TRIGGER IF EXISTS trg_result_audit_log_before_update;
DROP TRIGGER IF EXISTS trg_result_audit_log_before_delete;
DROP TABLE IF EXISTS result_audit_log;

ALTER TABLE toeic_attempts DROP INDEX uniq_user_exam_version;
ALTER TABLE toeic_attempts DROP COLUMN pinned_snapshot_version;
