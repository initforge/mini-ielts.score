/* R2-FE verification screenshots (playwright-core). 
 * Real API via vite proxy when backend is up; route interception as fallback. */
const { chromium } = require('/tmp/opencode/r2fe-pw/node_modules/playwright-core');

const BASE = 'http://localhost:5173';
const OUT = __dirname;
const TOKEN = require('fs').readFileSync('/tmp/opencode/s6fe-token.txt', 'utf8').trim();

const SYNTH_ATTEMPT = {
  id: 168,
  user_id: '1',
  exam_id: 1,
  status: 'IN_PROGRESS',
  mode: 'EXAM',
  started_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  responses: [],
  session: {
    sections: [
      { id: 1, exam_id: 1, title: 'Listening Part 1 — Photographs', order_index: 1, part_type: 'Part 1' },
      { id: 5, exam_id: 1, title: 'Reading Part 5 — Incomplete Sentences', order_index: 5, part_type: 'Part 5' },
    ],
    questions: [
      { id: 1, section_id: 1, type: 'MULTIPLE_CHOICE', order_index: 1, content: 'Statement about the photograph.', audio_url: '', image_url: '' },
      { id: 2, section_id: 1, type: 'MULTIPLE_CHOICE', order_index: 2, content: 'Second statement.', audio_url: '', image_url: '' },
      { id: 101, section_id: 5, type: 'MULTIPLE_CHOICE', order_index: 1, content: 'Choose the word that best completes the sentence.', audio_url: '', image_url: '' },
      { id: 102, section_id: 5, type: 'MULTIPLE_CHOICE', order_index: 2, content: 'Second gap sentence.', audio_url: '', image_url: '' },
    ],
    options: [
      { id: 11, question_id: 1, label: 'A', content: 'A man is reading.', order_index: 1 },
      { id: 12, question_id: 1, label: 'B', content: 'A woman is cooking.', order_index: 2 },
      { id: 13, question_id: 2, label: 'A', content: 'Trains depart hourly.', order_index: 1 },
      { id: 14, question_id: 2, label: 'B', content: 'The store is closed.', order_index: 2 },
      { id: 1011, question_id: 101, label: 'A', content: 'however', order_index: 1 },
      { id: 1012, question_id: 101, label: 'B', content: 'therefore', order_index: 2 },
      { id: 1021, question_id: 102, label: 'A', content: 'significantly', order_index: 1 },
      { id: 1022, question_id: 102, label: 'B', content: 'consequently', order_index: 2 },
    ],
  },
};

const SYNTH_RESULT = {
  listeningScore: 35,
  readingScore: 60,
  totalScore: 95,
  status: 'FINAL',
  parts: {
    part1: { correct: 1, total: 6 },
    part5: { correct: 1, total: 30 },
  },
};

const SYNTH_REVIEW = [
  { question_id: 1, correct_option_id: 11, explanation: 'The man is indeed reading.', sample_response: null, rubric: null },
  { question_id: 2, correct_option_id: 14, explanation: 'Store closing is described.', sample_response: null, rubric: null },
  { question_id: 101, correct_option_id: 1011, explanation: '"however" fits the contrast.', sample_response: null, rubric: null },
  { question_id: 102, correct_option_id: 1021, explanation: '"significantly" modifies the verb.', sample_response: null, rubric: null },
];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript((tok) => {
    localStorage.setItem('token', tok);
    localStorage.setItem('user', JSON.stringify({ id: 1, email: 'seed.owner@example.com' }));
  }, TOKEN);

  // 1. Exam detail page (desktop)
  try {
    await page.goto(`${BASE}/thi-thu/anish-full-lr-001`, { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    await page.route('**/api/toeic-exams/anish-full-lr-001', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(require('./detail-exam.json')) }));
    await page.goto(`${BASE}/thi-thu/anish-full-lr-001`, { waitUntil: 'networkidle', timeout: 30000 });
  }
  await page.screenshot({ path: `${OUT}/detail-page.png`, fullPage: true });

  // 2. Mobile timer: runner at 375px, attempt intercepted
  await page.route('**/api/toeic-attempts/168', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SYNTH_ATTEMPT) }));
  const ctxM = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const m = await ctxM.newPage();
  await m.addInitScript((tok) => localStorage.setItem('token', tok), TOKEN);
  await m.route('**/api/toeic-attempts/168', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SYNTH_ATTEMPT) }));
  await m.goto(`${BASE}/thi-thu/anish-full-lr-001/lam-bai/168`, { waitUntil: 'networkidle', timeout: 30000 });
  await m.waitForTimeout(1500);
  // Assert the timer pill is hidden below md (fix verification)
  const pill = await m.evaluate(() => {
    // The center timer pill lives in the absolutely-positioned header container.
    const pillEl = [...document.querySelectorAll('header div')].find(
      (d) => d.className.includes('rounded-full') && d.className.includes('bg-white'),
    );
    const header = document.querySelector('header');
    const hr = header ? header.getBoundingClientRect() : null;
    const r = pillEl ? pillEl.getBoundingClientRect() : null;
    return {
      found: !!pillEl,
      pillVisible: !!r && r.width > 0 && r.height > 0,
      inHeader: !!r && !!hr && r.bottom <= hr.bottom,
      rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    };
  });
  console.log('MOBILE_PILL:', JSON.stringify(pill));
  await m.screenshot({ path: `${OUT}/mobile-timer-375.png`, fullPage: false });

  // 3. Score-table modal on ResultPage (fake completed attempt)
  await page.route('**/api/toeic-attempts/999', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...SYNTH_ATTEMPT, id: 999, status: 'COMPLETED' }) }));
  await page.route('**/api/toeic-attempts/999/result', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SYNTH_RESULT) }));
  await page.route('**/api/toeic-attempts/999/review', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SYNTH_REVIEW) }));
  await page.goto(`${BASE}/thi-thu/ket-qua/999`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: `${OUT}/result-page.png`, fullPage: false });
  const btn = page.getByRole('button', { name: /Bảng kết quả/ });
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/score-table-modal.png`, fullPage: false });
  } else {
    console.log('SCORE_TABLE_BTN: NOT FOUND');
  }

  await browser.close();
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
