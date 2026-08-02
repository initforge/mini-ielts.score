/**
 * S6-FE journey — evidence generation (Playwright chromium, live dev env).
 *
 * Slice S6-FE | AC18 (SW success desktop+mobile, LR re-verify, SW failure
 * states) + AC19 (ownership UI/API, XSS probe, rate-limit, secret/pii audit).
 *
 * Reuses S4-FE / S5-FE patterns: chromium, deviceScaleFactor 1, console +
 * network capture per viewport, screenshot per step, STEP/PASS transcript
 * lines, sha256 of evidence. Does NOT modify source code.
 *
 * Failure-state worker swap + rate-limit are orchestrated OUTSIDE this script
 * (see failure.txt / security-fe.txt generation steps).
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

const BASE = 'http://localhost:5173';
const EV = '/home/linhnx/Projects/mini-toeic.score/.agent/evidence/S6-FE';
mkdirSync(EV, { recursive: true });

const OWNER = { email: 'seed.owner@example.com', password: 'seed-password-123' };
const OTHER = { email: 'seed.other@example.com', password: 'seed-password-123' };

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const NAMES = [
  'desktop', 'mobile',
  'lr-desktop', 'lr-mobile',
  'notfound-desktop', 'notfound-mobile',
  'ownership-desktop', 'ownership-mobile',
  'xss-desktop', 'xss-mobile',
];
const out = {};
const consoleLog = {};
const network = {};
for (const n of NAMES) { out[n] = []; consoleLog[n] = []; network[n] = []; }

function log(name, s) { out[name].push(s); console.log(`[${name}] ${s}`); }
function check(W, cond, label, extra = '') {
  W.checks.push(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
  if (!cond) W.errors++;
  return cond;
}
function hash(s) { return createHash('sha256').update(String(s)).digest('hex').slice(0, 16); }

/** Node-side API call (page-origin independent). */
async function api(token, method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, body: json, text };
}

async function newContext(browser, viewport, name, opts = {}) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    ...(opts.permissions ? { permissions: opts.permissions } : {}),
  });
  if (opts.injectToken) {
    await ctx.addInitScript((t) => { try { localStorage.setItem('token', t); } catch { /* noop */ } }, opts.injectToken);
  }
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) consoleLog[name].push(`${m.type().toUpperCase()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleLog[name].push(`PAGEERROR: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/')) network[name].push(`REQ ${r.method()} ${u.replace(BASE, '')}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/')) network[name].push(`RES ${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`);
  });
  return { ctx, page };
}

async function login(page, cred = OWNER) {
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="email@example.com"]', cred.email);
  await page.fill('input[placeholder="••••••••"]', cred.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/thi-thu/, { timeout: 12000 });
}

function shotMaker(page, name) {
  const seen = new Set();
  return async (key, label, fullPage = false) => {
    if (seen.has(key)) return;
    seen.add(key);
    const p = `${EV}/${key}-${name}.png`;
    await page.screenshot({ path: p, fullPage });
    log(name, `SCREENSHOT ${label} → ${key}-${name}.png`);
  };
}

/** Speaking question: record ~2.5s, stop, playback play+pause. */
async function recordSpeaking(page, name) {
  const prepBtn = page.locator('button:has-text("Bắt đầu chuẩn bị")');
  try {
    await prepBtn.waitFor({ timeout: 2500 });
    await prepBtn.click();
    await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
    await page.locator('button:has-text("Bỏ qua chuẩn bị")').click();
  } catch { /* prep auto-started/skipped */ }
  await page.locator('button[aria-label="Start recording"]').click();
  await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 8000 });
  await page.waitForTimeout(2500);
  await page.locator('button[aria-label="Stop recording"]').click();
  await page.waitForSelector('button:has-text("Play Recording")', { timeout: 8000 });
  await page.locator('button:has-text("Play Recording")').click();
  await page.waitForTimeout(1500);
  const pause = page.locator('button:has-text("Pause")');
  if (await pause.count()) await pause.click();
  const retry = page.locator('button:has-text("Retry")');
  try {
    await retry.waitFor({ timeout: 8000 });
    log(name, 'STEP upload Retry surfaced (mock S3, expected in dev)');
  } catch { /* upload raced or queued */ }
}

async function typing(page, text) {
  await page.locator('.ql-editor').click();
  await page.keyboard.type(text, { delay: 15 });
}

// ──────────────────────────────────────────────────────────────────────────
// 1. AC18 success — full SW journey (speaking + writing → processing →
//    result → review detail → history)
// ──────────────────────────────────────────────────────────────────────────
async function runSWJourney(browser, viewport, name) {
  const { ctx, page } = await newContext(browser, viewport, name, { permissions: ['microphone'] });
  const W = { errors: 0, checks: [] };
  let attemptId = null, token = null;
  const shot = shotMaker(page, name);
  try {
    await login(page, OWNER);
    log(name, 'STEP logged in as seed.owner');
    token = await page.evaluate(() => localStorage.getItem('token'));

    await page.goto(`${BASE}/thi-thu`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Thư viện đề thi', { timeout: 12000 });
    await page.locator('button:has-text("Speaking & Writing")').click();
    await page.waitForSelector('text=Anish Full Practice 1 — Speaking & Writing', { timeout: 12000 });
    await page.locator('button:has-text("Thi thử")').first().click();
    await page.waitForSelector('button:has-text("Bắt đầu")', { timeout: 12000 });
    await page.locator('button:has-text("Bắt đầu")').click();
    await page.waitForURL(/lam-bai-sw/, { timeout: 15000 });
    const m = page.url().match(/lam-bai-sw\/(\d+)/);
    attemptId = m ? m[1] : null;
    check(W, !!attemptId, `SW attempt created via catalog (id=${attemptId})`);

    // mic check
    await page.waitForSelector('text=Microphone Setup', { timeout: 15000 });
    await page.locator('button:has-text("Allow Microphone Access")').click();
    await page.waitForSelector('button:has-text("Continue to Test")', { timeout: 15000 });
    await page.locator('button:has-text("Continue to Test")').click();
    log(name, 'STEP mic granted');

    // directions → prep
    await page.waitForSelector('text=DIRECTIONS', { timeout: 10000 });
    await page.locator('button:has-text("BẮT ĐẦU")').click();
    await page.locator('button:has-text("Bắt đầu chuẩn bị")').waitFor({ timeout: 8000 });
    await page.locator('button:has-text("Bắt đầu chuẩn bị")').click();
    await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
    await page.locator('button:has-text("Bỏ qua chuẩn bị")').click();
    await page.locator('button[aria-label="Start recording"]').waitFor({ timeout: 5000 });
    log(name, 'STEP directions → prep → recording ready');

    // speaking q22/q23/q24 (seed SW exam: 3 SPEAKING + 2 WRITING questions)
    await recordSpeaking(page, name);
    check(W, true, 'speaking q22: record → stop → playback done');
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.locator('button[aria-label="Start recording"]').waitFor({ timeout: 8000 });
    await recordSpeaking(page, name);
    check(W, true, 'speaking q23: record → stop → playback done');
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.locator('button[aria-label="Start recording"]').waitFor({ timeout: 8000 });
    await recordSpeaking(page, name);
    check(W, true, 'speaking q24: record → stop → playback done');
    log(name, 'STEP all three speaking questions recorded');

    // writing q25/q26 (first writing question after the 3 speaking)
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('.ql-editor', { timeout: 10000 });
    const essayQ25 =
      'Dear Ms. Tran,\n\nI would like to request two days of leave next month to help my family move to a new house.\nI will finish all pending tasks before the leave and my colleague will cover urgent requests.\n\nThank you.\nBest regards, Linh.';
    await typing(page, essayQ25);
    await page.waitForTimeout(2000);
    const wc = await page.locator('text=Từ:').textContent();
    check(W, wc && parseInt(wc.replace(/\D/g, '')) >= 40, 'writing q25 word count rendered', wc || '');
    log(name, `STEP writing q25 typed, word count: ${wc}`);
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('.ql-editor', { timeout: 10000 });
    await typing(page, 'I visited Green Bowl last week. The food was fresh and the staff were friendly. I suggest adding an online reservation system so customers can book in advance.');
    await page.waitForTimeout(2000);
    log(name, 'STEP writing q25-26 answered');

    // submit → processing
    await page.locator('button:has-text("NỘP BÀI")').click();
    await page.waitForURL(/dang-xu-ly/, { timeout: 30000 });
    log(name, 'STEP submitted → processing page');
    await page.waitForTimeout(700);
    const procText = await page.locator('body').innerText();
    check(W, /Đang/.test(procText) || /chấm/.test(procText), 'ProcessingPage progress UI rendered');
    await shot('processing', 'processing page', false);
    check(W, /dang-xu-ly/.test(page.url()), 'processing page URL reached');

    // processing → result (auto-navigate on COMPLETED)
    await page.waitForURL(/ket-qua\/\d+/, { timeout: 60000 });
    await page.waitForSelector('text=AI GRADING RESULT', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const resText = await page.locator('body').innerText();
    check(W, /AI GRADING RESULT/.test(resText), 'SW certificate header rendered');
    check(W, /TOTAL SCORE/.test(resText), 'certificate TOTAL SCORE section');
    check(W, /400/.test(resText), 'totalScore 400 shown');
    check(W, /FINAL/.test(resText), 'status FINAL tag shown');
    check(W, (/Speaking|SPEAKING/.test(resText)) && (/Writing|WRITING/.test(resText)), 'per-section Speaking + Writing shown');
    await shot('result', 'result certificate', true);
    log(name, 'STEP result certificate verified');

    // review detail (/chi-tiet)
    await page.locator('a[href*="chi-tiet"], button:has-text("Xem lại bài thi")').first().click();
    await page.waitForURL(/chi-tiet/, { timeout: 15000 });
    await page.waitForSelector('text=Xem lại bài thi', { timeout: 15000 });
    await page.waitForTimeout(800);
    const revText = await page.locator('body').innerText();
    check(W, /CÂU HỎI/.test(revText) && /BÀI LÀM CỦA BẠN/.test(revText), 'review detail per-question blocks');
    check(W, /SPEAKING/.test(revText) && /WRITING/.test(revText), 'SPEAKING/WRITING tags present');
    check(W, revText.includes('I would like to request two days of leave'), 'writing textResponse shown in review');
    check(W, /Câu 1/.test(revText) && /Câu 5/.test(revText), 'all 5 questions listed');
    await shot('review', 'review detail', true);
    log(name, 'STEP review detail verified');

    // history
    await page.goto(`${BASE}/thi-thu/lich-su`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Lịch Sử Luyện Tập', { timeout: 15000 });
    await page.waitForTimeout(1000);
    const histText = await page.locator('body').innerText();
    check(W, histText.includes(`ID: ${attemptId}`), `attempt ${attemptId} in history`);
    check(W, /Hoàn thành/.test(histText), 'COMPLETED status chip (Hoàn thành)');
    const link = page.locator(`a[href="/thi-thu/ket-qua/${attemptId}"]`);
    check(W, (await link.count()) > 0, 'Xem kết quả link present');
    await shot('history', 'history page', true);
    log(name, 'STEP history page verified');

    // API cross-check
    const gs = await api(token, 'GET', `/toeic-attempts/${attemptId}/grading-status`);
    check(W, gs.body?.status === 'COMPLETED', `grading-status COMPLETED (got ${gs.body?.status})`);
    const res = await api(token, 'GET', `/toeic-attempts/${attemptId}/result`);
    check(W, res.body?.totalScore === 400, `result totalScore=400 (got ${res.body?.totalScore})`);
    check(W, res.body?.status === 'FINAL', 'result status FINAL');
    const at = await api(token, 'GET', `/toeic-attempts/${attemptId}`);
    check(W, at.body?.status === 'COMPLETED', 'attempt status COMPLETED');
    const rv = await api(token, 'GET', `/toeic-attempts/${attemptId}/review`);
    check(W, Array.isArray(rv.body) && rv.body.length === 5, `review rows=5 (got ${rv.body?.length})`);
    log(name, `STEP API checks done (grading=${gs.body?.status}, totalScore=${res.body?.totalScore})`);
    return { W, attemptId, token };
  } catch (err) {
    console.error(`[${name}] UNHANDLED JOURNEY ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { check(W, false, 'journey unhandled error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220)); } catch { /* noop */ }
    if (!token) { try { token = await page.evaluate(() => localStorage.getItem('token')); } catch { /* page gone */ } }
    return { W, attemptId, token };
  } finally {
    await ctx.close();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 2. AC18 LR re-verify (light): answer 21 → submit → certificate (14/990) →
//    error map chart → review modal
// ──────────────────────────────────────────────────────────────────────────
async function dismissDirections(page) {
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('button:has-text("NEXT")').last();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    } else break;
  }
}

async function selectCurrentAnswer(page, qIndex, correctIdx) {
  let radios;
  const card = page.locator('div.border-blue-600[id^="question-"]').first();
  if (await card.count()) {
    radios = card.locator('[role="radio"]');
  } else {
    radios = page.locator('main [role="radio"]');
  }
  const n = await radios.count();
  if (n === 0) return false;
  await radios.nth(correctIdx ?? (qIndex % n)).click();
  await page.waitForTimeout(120);
  return true;
}

const PART_OF = (i) => Math.floor(i / 3) + 1; // 0-based qIndex → part 1..7

// Seed LR exam 1 (21 Q): 0-based index of the correct option per question
// (verified against toeic_question_review_content → toeic_question_options).
const LR_CORRECT_IDX = [0, 2, 3, 0, 3, 1, 1, 0, 2, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 1];

async function runLRVerify(browser, viewport, name, ownerToken) {
  const { ctx, page } = await newContext(browser, viewport, name, { injectToken: ownerToken });
  const W = { errors: 0, checks: [] };
  let attemptId = null;
  const shot = shotMaker(page, name);
  try {
    const created = await api(ownerToken, 'POST', '/toeic-exams/1/attempts', { mode: 'EXAM' });
    attemptId = created.body?.attemptId;
    check(W, !!attemptId, `LR attempt created via API (id=${attemptId})`);

    await page.goto(`${BASE}/thi-thu/lam-bai/${attemptId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=DIRECTIONS', { timeout: 20000 });
    await dismissDirections(page);
    for (let i = 0; i < 21; i++) {
      await dismissDirections(page);
      // Answer q1-q14 correctly, q15-q21 deliberately wrong → deterministic
      // totalScore = 14 (matches the seeded correct answer set 8L + 6R = 14).
      const idx = i < 14 ? LR_CORRECT_IDX[i] : (LR_CORRECT_IDX[i] + 1) % 4;
      const ok = await selectCurrentAnswer(page, i, idx);
      check(W, ok, `answered q${i + 1} (option idx ${idx})`);
      if (i < 20) {
        await page.locator('button:has-text("Câu tiếp")').click();
        await page.waitForTimeout(180);
      }
    }
    log(name, 'STEP answered all 21 LR questions');
    await page.waitForTimeout(1200);

    await page.locator('button:has-text("NỘP BÀI")').first().click();
    await page.waitForSelector('.ant-modal-confirm', { timeout: 8000 });
    await page.locator('.ant-modal-confirm .ant-btn-primary').click();
    await page.waitForURL(/ket-qua\/\d+/, { timeout: 60000 });
    await page.waitForSelector('text=UNOFFICIAL SCORE CERTIFICATE', { timeout: 20000 });
    await page.waitForTimeout(1000);
    const cert = await page.locator('body').innerText();
    check(W, /\/ 990/.test(cert), 'LR certificate "/ 990" shown');
    const res = await api(ownerToken, 'GET', `/toeic-attempts/${attemptId}/result`);
    check(W, res.body?.totalScore === 14, `LR result totalScore=14 (got ${res.body?.totalScore})`);
    await shot('result-lr', 'LR result certificate', true);
    log(name, 'STEP LR certificate verified');

    await page.locator('a[href*="chi-tiet"], button:has-text("Bản đồ lỗi sai")').first().click();
    await page.waitForURL(/chi-tiet/, { timeout: 15000 });
    await page.waitForSelector('text=Bản đồ lỗi sai TOEIC', { timeout: 15000 });
    await page.waitForTimeout(800);
    const map = await page.locator('body').innerText();
    check(W, /Lỗi sai theo Part/.test(map), 'error map chart section');
    check(W, /Câu sai cần ôn lại/.test(map), 'wrong-question list section');
    await shot('errormap-lr', 'LR error map page', true);
    const rev200 = network[name].filter((l) => /RES 200 GET \/api\/toeic-attempts\/\d+\/review/.test(l)).length;
    check(W, rev200 >= 1, `review GET 200 seen (count=${rev200})`);

    await page.locator('button:has-text("Xem lại chi tiết")').first().click();
    await page.waitForSelector('.ant-modal', { timeout: 8000 });
    check(W, (await page.locator('.ant-modal table').count()) > 0, 'review modal table rendered');
    await page.keyboard.press('Escape');
    log(name, 'STEP LR error map + review modal verified');
    return { W, attemptId };
  } catch (err) {
    console.error(`[${name}] UNHANDLED LR ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { check(W, false, 'lr journey unhandled error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220)); } catch { /* noop */ }
    return { W, attemptId };
  } finally {
    await ctx.close();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 3. AC18 failure — processing page transport error for nonexistent attempt
// ──────────────────────────────────────────────────────────────────────────
async function runNotFound(browser, viewport, name) {
  const { ctx, page } = await newContext(browser, viewport, name);
  const W = { errors: 0, checks: [] };
  const shot = shotMaker(page, name);
  try {
    await login(page, OWNER);
    log(name, 'STEP logged in as seed.owner');
    await page.goto(`${BASE}/thi-thu/dang-xu-ly/999999`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Không thể kiểm tra trạng thái', { timeout: 15000 });
    const body = await page.locator('body').innerText();
    check(W, body.includes('Không tìm thấy bài thi này.'), 'friendly 404 message shown');
    check(W, body.includes('Thử lại'), 'Thử lại (retry) button present');
    check(W, !/Error:|at \S+|stack/i.test(body), 'no raw error / stack trace leaked');
    await shot('processing-notfound', 'processing notfound transport-error state', false);
    log(name, 'STEP notfound transport-error state verified');
    return { W };
  } catch (err) {
    console.error(`[${name}] UNHANDLED NOTFOUND ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { check(W, false, 'notfound journey error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220)); } catch { /* noop */ }
    return { W };
  } finally {
    await ctx.close();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 4. AC19 ownership — seed.other cannot read owner attempt (API 404 + UI)
// ──────────────────────────────────────────────────────────────────────────
async function runOwnership(browser, viewport, name, ownerAttemptId) {
  const { ctx, page } = await newContext(browser, viewport, name);
  const W = { errors: 0, checks: [] };
  const shot = shotMaker(page, name);
  try {
    await login(page, OTHER);
    log(name, 'STEP logged in as seed.other');
    const checks = await page.evaluate(async (id) => {
      const t = localStorage.getItem('token');
      const out = {};
      for (const path of ['', '/result', '/grading-status', '/review']) {
        const r = await fetch(`/api/toeic-attempts/${id}${path}`, { headers: { Authorization: `Bearer ${t}` } });
        const b = await r.text();
        out[path || '/'] = {
          status: r.status,
          leak: /session|responses|questions|listeningScore|readingScore|totalScore|text_response/.test(b),
          body: b.slice(0, 100),
        };
      }
      return out;
    }, Number(ownerAttemptId));
    for (const [path, r] of Object.entries(checks)) {
      check(W, r.status === 404 || r.status === 403, `other user GET ${path || '/'} → ${r.status} (403/404)`, r.body);
      check(W, !r.leak, `no data leak via ${path || '/'}`);
      log(name, `GET /toeic-attempts/${ownerAttemptId}${path} → ${r.status}, leak=${r.leak}`);
    }
    await page.goto(`${BASE}/thi-thu/ket-qua/${ownerAttemptId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ant-alert', { timeout: 15000 });
    const body = await page.locator('body').innerText();
    check(W, body.includes('Chưa có kết quả'), 'friendly error (not certificate) rendered');
    check(W, !/UNOFFICIAL SCORE CERTIFICATE|AI GRADING RESULT/.test(body), 'certificate NOT rendered for other user');
    await shot('ownership', 'ownership blocked result page', false);
    log(name, 'STEP ownership (API 404 + UI blocked) verified');
    return { W };
  } catch (err) {
    console.error(`[${name}] UNHANDLED OWNERSHIP ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { check(W, false, 'ownership journey error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220)); } catch { /* noop */ }
    return { W };
  } finally {
    await ctx.close();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 5. AC19 XSS probe — payload in writing editor, render-boundary sanitize
// ──────────────────────────────────────────────────────────────────────────
async function runXSS(browser, viewport, name, ownerToken) {
  const { ctx, page } = await newContext(browser, viewport, name, { permissions: ['microphone'] });
  const W = { errors: 0, checks: [] };
  const shot = shotMaker(page, name);
  const dialogs = [];
  const pageErrors = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    const PAYLOAD = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const created = await api(ownerToken, 'POST', '/toeic-exams/2/attempts', { mode: 'EXAM' });
    const attemptId = created.body?.attemptId;
    check(W, !!attemptId, `XSS attempt created via API (id=${attemptId})`);

    await page.goto(`${BASE}/thi-thu/lam-bai-sw/${attemptId}`, { waitUntil: 'domcontentloaded' });
    // resilience: dev-container network blips can drop the HMR/asset stream;
    // retry navigation until the runner mounts (max 3 attempts).
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.waitForSelector('text=Microphone Setup', { timeout: 12000 });
        break;
      } catch {
        if (attempt === 3) throw new Error(`SW runner never mounted (3 attempts)`);
        log(name, `WARN runner mount timeout (attempt ${attempt}/3) — reloading`);
        await page.goto(`${BASE}/thi-thu/lam-bai-sw/${attemptId}`, { waitUntil: 'domcontentloaded' });
      }
    }
    await page.locator('button:has-text("Allow Microphone Access")').click();
    await page.waitForSelector('button:has-text("Continue to Test")', { timeout: 15000 });
    await page.locator('button:has-text("Continue to Test")').click();
    await page.waitForSelector('text=DIRECTIONS', { timeout: 10000 });
    await page.locator('button:has-text("BẮT ĐẦU")').click();
    // skip 3 speaking questions (q22-q24) → first writing question (q25)
    await page.waitForTimeout(600);
    for (let i = 0; i < 3; i++) {
      await page.locator('button:has-text("Câu tiếp")').click();
      await page.waitForTimeout(600);
    }
    await page.waitForSelector('.ql-editor', { timeout: 10000 });
    await typing(page, PAYLOAD);
    await page.waitForTimeout(2500); // autosave PATCH

    const editorState = await page.evaluate(() => {
      const editor = document.querySelector('.ql-editor');
      return {
        hasScriptEl: !!editor?.querySelector('script'),
        hasImgEl: !!editor?.querySelector('img'),
        hasOnerrorAttr: !!(editor && /onerror=/.test(editor.innerHTML)),
        text: editor?.innerText ?? '',
      };
    });
    check(W, !editorState.hasScriptEl, 'editor: no <script> element');
    check(W, !editorState.hasOnerrorAttr, 'editor: no onerror= attribute');
    check(W, editorState.text.includes('<script>alert(1)</script>'), 'editor: payload stored as literal text');
    await shot('xss-editor', 'XSS payload typed in writing editor', false);

    // submit → wait for grading → review detail render boundary
    await page.locator('button:has-text("NỘP BÀI")').click();
    await page.waitForURL(/ket-qua\/\d+/, { timeout: 60000 });
    await page.waitForSelector('text=AI GRADING RESULT', { timeout: 20000 });
    await page.goto(`${BASE}/thi-thu/ket-qua/${attemptId}/chi-tiet`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Xem lại bài thi', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const dom = await page.evaluate(() => ({
      scriptEls: document.querySelectorAll('script').length,
      onerrorAttrs: document.querySelectorAll('[onerror]').length,
      onerrorStr: document.body.innerHTML.match(/onerror=/g)?.length ?? 0,
      imgNoHandler: (document.querySelectorAll('img[src="x"]').length > 0)
        ? !document.querySelector('img[src="x"]')?.hasAttribute('onerror')
        : true,
    }));
    check(W, dialogs.length === 0, 'no alert dialog fired', `dialogs=${dialogs.length}`);
    check(W, pageErrors.length === 0, 'no page JS error', pageErrors.join('; ').slice(0, 120));
    check(W, dom.scriptEls === 0, 'no <script> element in rendered review DOM', `scriptEls=${dom.scriptEls}`);
    check(W, dom.onerrorAttrs === 0, 'no [onerror] attribute in rendered DOM');
    check(W, dom.onerrorStr === 0, 'no onerror= handler string in rendered HTML');
    check(W, dom.imgNoHandler, 'img tag rendered without onerror handler');
    await shot('xss-writing', 'XSS payload rendered sanitized in review', true);
    log(name, `STEP XSS render-boundary verified (dialogs=${dialogs.length}, pageErrors=${pageErrors.length})`);

    // backend stored raw payload as plain text (FE render boundary does sanitize)
    const at = await api(ownerToken, 'GET', `/toeic-attempts/${attemptId}`);
    const q25 = (at.body?.responses ?? []).find((r) => r.question_id === 25);
    check(W, !!q25?.text_response && q25.text_response.includes('<script>alert(1)</script>'),
      'backend stores payload verbatim as plain text (sanitize happens at FE render boundary)',
      hash(q25?.text_response ?? ''));
    return { W, attemptId };
  } catch (err) {
    console.error(`[${name}] UNHANDLED XSS ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { check(W, false, 'xss journey error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220)); } catch { /* noop */ }
    return { W };
  } finally {
    await ctx.close();
  }
}

// ──────────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

const desktop = await runSWJourney(browser, VIEWPORTS.desktop, 'desktop');
const mobile = await runSWJourney(browser, VIEWPORTS.mobile, 'mobile');
const ownerToken = desktop.token || mobile.token;
if (ownerToken) {
  writeFileSync('/tmp/opencode/s6fe-token.txt', ownerToken, 'utf8');
  console.log('ownerToken written to /tmp/opencode/s6fe-token.txt');
}
const lrDesktop = await runLRVerify(browser, VIEWPORTS.desktop, 'lr-desktop', ownerToken);
const lrMobile = await runLRVerify(browser, VIEWPORTS.mobile, 'lr-mobile', ownerToken);
const nfDesktop = await runNotFound(browser, VIEWPORTS.desktop, 'notfound-desktop');
const nfMobile = await runNotFound(browser, VIEWPORTS.mobile, 'notfound-mobile');
const owDesktop = await runOwnership(browser, VIEWPORTS.desktop, 'ownership-desktop', desktop.attemptId);
const owMobile = await runOwnership(browser, VIEWPORTS.mobile, 'ownership-mobile', desktop.attemptId);
// NOTE: XSS probe runs in a separate script (xss-script.mjs) with a fresh
// browser instance — long-lived browser + vite HMR gets flaky after ~10
// contexts and the SW runner fails to mount (network 401 blips).

await browser.close();

// ──────────────────────────────────────────────────────────────────────────
// Evidence files
// ──────────────────────────────────────────────────────────────────────────
const now = new Date().toISOString();

function checklistBlock(result, ac, dim) {
  const pass = result.W.checks.filter((c) => c.startsWith('PASS')).length;
  const fail = result.W.checks.filter((c) => c.startsWith('FAIL')).length;
  return [
    `CHECKLIST | ${ac} (${dim}) | PASS=${pass} FAIL=${fail}`,
    ...result.W.checks.map((c) => `  ${c}`),
  ];
}

function renderJourney(name, label, result, ac) {
  return [
    `S6-FE ${label} — viewport ${JSON.stringify(VIEWPORTS[name])}`,
    `timestamp: ${now}`,
    `attemptId: ${result.attemptId ?? 'n/a'}`,
    `errors: ${result.W.errors}`,
    '',
    ...checklistBlock(result, ac, name),
    '',
    'STEP transcript:',
    ...out[name],
  ].join('\n');
}

writeFileSync(`${EV}/journey-desktop.txt`, renderJourney('desktop', 'AC18 SW success journey', desktop, 'AC18'));
writeFileSync(`${EV}/journey-mobile.txt`, renderJourney('mobile', 'AC18 SW success journey', mobile, 'AC18'));

writeFileSync(
  `${EV}/console-network.txt`,
  [
    'S6-FE console (errors/warnings) + /api network proof',
    `timestamp: ${now}`,
    '',
    '=== DESKTOP SW console ===', ...consoleLog.desktop,
    '',
    '=== MOBILE SW console ===', ...consoleLog.mobile,
    '',
    '=== LR DESKTOP console ===', ...consoleLog['lr-desktop'],
    '',
    '=== LR MOBILE console ===', ...consoleLog['lr-mobile'],
    '',
    '=== NOTFOUND DESKTOP console ===', ...consoleLog['notfound-desktop'],
    '',
    '=== DESKTOP network (/api) ===', ...network.desktop,
    '',
    '=== MOBILE network (/api) ===', ...network.mobile,
    '',
    '=== LR DESKTOP network (/api) ===', ...network['lr-desktop'],
  ].join('\n')
);

// failure.txt gets notfound + ownership blocks here; the FAILED-state + rate
// limit sections are appended by the orchestration step.
writeFileSync(
  `${EV}/failure.txt`,
  [
    'S6-FE AC18/AC19 failure + ownership evidence',
    `timestamp: ${now}`,
    '',
    '--- SECTION 1: AC18 failure — processing page transport error (nonexistent attempt) ---',
    ...checklistBlock(nfDesktop, 'AC18', 'notfound-desktop'),
    ...out['notfound-desktop'],
    '',
    ...checklistBlock(nfMobile, 'AC18', 'notfound-mobile'),
    ...out['notfound-mobile'],
    '',
    '--- SECTION 2: AC19 ownership — seed.other cannot read seed.owner attempt ---',
    ...checklistBlock(owDesktop, 'AC19', 'ownership-desktop'),
    ...out['ownership-desktop'],
    '',
    ...checklistBlock(owMobile, 'AC19', 'ownership-mobile'),
    ...out['ownership-mobile'],
    '',
    '--- SECTION 3: AC18 failure — grading FAILED state (appended by orchestration) ---',
  ].join('\n')
);

// security-fe.txt is assembled by the XSS script + rate-limit orchestration
// (static audit + XSS probe + rate-limit results), so the evidence set stays
// consistent with the live runs.

console.log('\n--- S6-FE JOURNEY SUMMARY ---');
const all = { desktop, mobile, 'lr-desktop': lrDesktop, 'lr-mobile': lrMobile, 'notfound-desktop': nfDesktop, 'notfound-mobile': nfMobile, 'ownership-desktop': owDesktop, 'ownership-mobile': owMobile };
for (const [n, r] of Object.entries(all)) {
  console.log(`${n}: errors=${r.W.errors} attemptId=${r.attemptId ?? '-'}`);
  for (const c of r.W.checks.filter((x) => x.startsWith('FAIL'))) console.log(`  ${c}`);
}
console.log('evidence written to', EV);
