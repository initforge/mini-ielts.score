-- Rollback INJ004-A4-IMPORT-IMPLEMENT-003: drop import jobs table and audit log.
DROP TRIGGER IF EXISTS trg_import_audit_log_before_delete;
DROP TRIGGER IF EXISTS trg_import_audit_log_before_update;
DROP TABLE IF EXISTS import_audit_log;
DROP TABLE IF EXISTS import_jobs;
