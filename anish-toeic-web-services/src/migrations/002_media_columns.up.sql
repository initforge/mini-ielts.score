-- R2-S5-SEED / INJ-003: media + timed-prompt metadata for S&W questions.
-- Runner convention: ^\d+.*\.(up|down)\.sql$ → picked up automatically after 001_schema.
ALTER TABLE toeic_questions
    ADD COLUMN prep_time_seconds INT NULL COMMENT 'Speaking: preparation time (s)',
    ADD COLUMN record_time_seconds INT NULL COMMENT 'Speaking: recording time (s)',
    ADD COLUMN min_words INT NULL COMMENT 'Writing: minimum word count';
