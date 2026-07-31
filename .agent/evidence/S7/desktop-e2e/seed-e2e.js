const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'root',
    database: 'anish_toeic',
    multipleStatements: true,
  });

  // Add reading section (Part 5)
  await pool.query(
    "INSERT INTO toeic_exam_sections (exam_id, title, instructions, order_index) VALUES (1, 'Reading Part 5', 'Incomplete Sentences', 2)"
  );

  // Add reading question
  await pool.query(
    "INSERT INTO toeic_questions (section_id, type, order_index, content) VALUES (2, 'MULTIPLE_CHOICE', 2, 'The manager asked all employees to submit their reports by Friday ___.')"
  );

  // Add options for reading question (id=2)
  await pool.query(
    "INSERT INTO toeic_question_options (question_id, label, content, order_index) VALUES (2, 'A', 'morning', 1), (2, 'B', 'afternoon', 2), (2, 'C', 'evening', 3), (2, 'D', 'night', 4)"
  );

  // Add review content (correct answers) for both questions
  // Q1: correct option is id=1 (A), Q2: correct option is id=6 (B, after the 4 new ones)
  await pool.query(
    "INSERT INTO toeic_question_review_content (question_id, correct_option_id, explanation) VALUES (1, 1, 'Explanation for Q1'), (2, 6, 'Explanation for Q2 - correct answer is B: afternoon')"
  );

  // Verify
  const [q] = await pool.query(
    'SELECT q.id, q.content, s.title as section_title, s.order_index as section_order FROM toeic_questions q JOIN toeic_exam_sections s ON q.section_id = s.id ORDER BY q.id'
  );
  console.log('Questions:', JSON.stringify(q));

  const [o] = await pool.query('SELECT * FROM toeic_question_options');
  console.log('Options:', JSON.stringify(o));

  const [r] = await pool.query('SELECT * FROM toeic_question_review_content');
  console.log('Review:', JSON.stringify(r));

  await pool.end();
  console.log('Seed complete.');
})();
