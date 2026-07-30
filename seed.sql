INSERT INTO toeic_exam_collections (title, slug) VALUES ('ETS 2024', 'ets-2024');
INSERT INTO toeic_exams (collection_id, slug, title, duration_minutes, question_count, skill_type) VALUES (1, 'ets-2024-test-1', 'ETS 2024 - Test 1', 120, 200, 'LR');
INSERT INTO toeic_exams (collection_id, slug, title, duration_minutes, question_count, skill_type) VALUES (1, 'ets-2024-test-1-sw', 'ETS 2024 - Test 1 (S&W)', 60, 20, 'SW');
INSERT INTO toeic_exam_sections (exam_id, title, instructions, order_index) VALUES (1, 'Listening Part 1', 'Directions', 1);
INSERT INTO toeic_questions (section_id, type, order_index, content) VALUES (1, 'MULTIPLE_CHOICE', 1, 'Question 1');
INSERT INTO toeic_question_options (question_id, label, content, order_index) VALUES (1, 'A', 'Option A', 1), (1, 'B', 'Option B', 2), (1, 'C', 'Option C', 3), (1, 'D', 'Option D', 4);
