/* R2-FE verification (DOM-based, no image reading). */
const { chromium } = require('/tmp/opencode/r2fe-pw/node_modules/playwright-core');

const BASE = 'http://localhost:5173';
const TOKEN = require('fs').readFileSync('/tmp/opencode/s6fe-token.txt', 'utf8').trim();

const SYNTH_ATTEMPT = {
  id: 168, user_id: '1', exam_id: 1, status: 'IN_PROGRESS', mode: 'EXAM',
  started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  responses: [],
  session: {
    sections: [
      { id: 1, exam_id: 1, title: 'Listening Part 1 — Photographs', order_index: 1, part_type: 'Part 1' },
      { id: 5, exam_id: 1, title: 'Reading Part 5 — Incomplete Sentences', order_index: 5, part_type: 'Part 5' },
    ],
    questions: [
      { id: 1, section_id: 1, type: 'MULTIPLE_CHOICE', order_index: 1, content: 'Statement about the photograph.', audio_url: '', image_url: '' },
      { id: 2, section_id: 1, type: 'MULTIPLE_CHOICE', order_index: 2, content: 'Second statement.', audio_url: '', image_url: '' },
      { id: 101, section_id: 5, type: 'MULTIPLE_CHOICE', order_index: 1, content: 'Choose the best word.', audio_url: '', image_url: '' },
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
const SYNTH_RESULT = { listeningScore: 35, readingScore: 60, totalScore: 95, status: 'FINAL', parts: { part1: { correct: 1, total: 6 }, part5: { correct: 1, total: 30 } } };
const SYNTH_REVIEW = [
  { question_id: 1, correct_option_id: 11, explanation: 'A man is reading.', sample_response: null, rubric: null },
  { question_id: 2, correct_option_id: 14, explanation: 'Store closing.', sample_response: null, rubric: null },
  { question_id: 101, correct_option_id: 1011, explanation: 'however fits.', sample_response: null, rubric: null },
  { question_id: 102, correct_option_id: 1021, explanation: 'significantly.', sample_response: null, rubric: null },
];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript((tok) => localStorage.setItem('token', tok), TOKEN);
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

  // 1. Detail page
  await page.goto(`${BASE}/thi-thu/anish-full-lr-001`, { waitUntil: 'networkidle', timeout: 30000 });
  const detail = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent ?? null,
    body: document.body.innerText.slice(0, 400),
    modeBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Bắt đầu')),
    hasHeader: !!document.querySelector('header'),
    hasFooter: [...document.querySelectorAll('footer')].some((f) => f.textContent.includes('ANISH TOEIC')),
  }));
  console.log('DETAIL:', JSON.stringify(detail, null, 1));
  await page.screenshot({ path: require('path').join(__dirname, 'detail-page.png'), fullPage: true });

  // 2. Mobile runner timer pill
  const ctxM = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const m = await ctxM.newPage();
  await m.addInitScript((tok) => localStorage.setItem('token', tok), TOKEN);
  await m.route('**/api/toeic-attempts/168', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SYNTH_ATTEMPT) }));
  await m.goto(`${BASE}/thi-thu/anish-full-lr-001/lam-bai/168`, { waitUntil: 'networkidle', timeout: 30000 });
  await m.waitForTimeout(2000);
  const pill = await m.evaluate(() => {
    const pillEl = [...document.querySelectorAll('header div')].find(
      (d) => d.className.includes('rounded-full') && d.className.includes('bg-white'),
    );
    const absContainer = [...document.querySelectorAll('header div')].find(
      (d) => typeof d.className === 'string' && d.className.includes('absolute') && d.className.includes('-translate-x-1/2'),
    );
    const r = pillEl ? pillEl.getBoundingClientRect() : null;
    return {
      pillFound: !!pillEl,
      pillVisible: !!r && r.width > 0 && r.height > 0,
      absContainerHiddenClass: absContainer ? /(^|\s)hidden(\s|$)/.test(absContainer.className) : null,
      pageText: document.body.innerText.slice(0, 120),
    };
  });
  console.log('MOBILE_PILL:', JSON.stringify(pill, null, 1));
  await m.screenshot({ path: require('path').join(__dirname, 'mobile-timer-375.png') });

  // 3. Score-table modal
  await page.route('**/api/toeic-attempts/999', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...SYNTH_ATTEMPT, id: 999, status: 'COMPLETED' }) }));
  await page.route('**/api/toeic-attempts/999/result', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SYNTH_RESULT) }));
  await page.route('**/api/toeic-attempts/999/review', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SYNTH_REVIEW) }));
  await page.goto(`${BASE}/thi-thu/ket-qua/999`, { waitUntil: 'networkidle', timeout: 30000 });
  const resultInfo = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 300),
    hasScoreBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Bảng kết quả')),
  }));
  console.log('RESULT:', JSON.stringify(resultInfo, null, 1));
  await page.screenshot({ path: require('path').join(__dirname, 'result-page.png') });
  const btn = page.getByRole('button', { name: /Bảng kết quả/ });
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(800);
    const modalInfo = await page.evaluate(() => ({
      modalTitle: [...document.querySelectorAll('.ant-modal-title')].map((e) => e.textContent),
      rows: document.querySelectorAll('.ant-modal-content .ant-table-row').length,
      headers: [...document.querySelectorAll('.ant-modal-content .ant-table-thead th')].map((e) => e.textContent),
    }));
    console.log('SCORE_MODAL:', JSON.stringify(modalInfo, null, 1));
    await page.screenshot({ path: require('path').join(__dirname, 'score-table-modal.png') });
  } else {
    console.log('SCORE_MODAL: BUTTON NOT FOUND');
  }

  console.log('JS_ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8)) : 'none');
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
