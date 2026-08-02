-- R2-S5-SEED rollback.
ALTER TABLE toeic_questions
    DROP COLUMN min_words,
    DROP COLUMN record_time_seconds,
    DROP COLUMN prep_time_seconds;
