/**
 * S7 AC21 — synthetic SW journey (desktop + mobile), full catalog -> history.
 * Reuses S5-FE / S6-FE patterns.
 *
 * login -> catalog -> SW exam id=2 (anish-full-sw-001) -> mic granted ->
 * speaking q22-24 (record/stop/playback) -> writing q25-26 (text + word count)
 * -> submit -> ProcessingPage -> COMPLETED -> result 400 FINAL ->
 * review (5 rows) -> history.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

const BASE = 'http://localhost:5173';
const EV = '/home/linhnx/Projects/mini-toeic.score/.agent/evidence/S7';
mkdirSync(EV, { recursive: true });

const OWNER = { email: 'seed.owner@example.com', password: 'seed-password-123' };
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const out = { desktop: [], mobile: [] };
const consoleLog = { desktop: [], mobile: [] };
const network = { desktop: [], mobile: [] };

function log(name, s) { out[name].push(s); console.log(`[${name}] ${s}`); }
function hash(s) { return createHash('sha256').update(String(s)).digest('hex').slice(0, 16); }
function check(W, cond, label, extra = '') {
  W.checks.push(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
  if (!cond) W.errors++;
  return cond;
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, body: json, text };
}

async function newContext(browser, viewport, name) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 1, ignoreHTTPSErrors: true, permissions: ['microphone'],
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleLog[name].push(`${m.type().toUpperCase()}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleLog[name].push(`PAGEERROR: ${e.message}`));
  page.on('request', (r) => { const u = r.url(); if (u.includes('/api/')) network[name].push(`REQ ${r.method()} ${u.replace(BASE, '')}`); });
  page.on('response', (r) => { const u = r.url(); if (u.includes('/api/')) network[name].push(`RES ${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`); });
  return { ctx, page };
}

async function login(page) {
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="email@example.com"]', OWNER.email);
  await page.fill('input[placeholder="••••••••"]', OWNER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/thi-thu/, { timeout: 12000 });
}

async function typing(page, text) {
  await page.locator('.ql-editor').click();
  await page.keyboard.type(text, { delay: 12 });
}

/** Speaking question: record ~2.5s, stop, playback play+pause. */
async function recordSpeaking(page, name, label) {
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
  log(name, `STEP speaking ${label}: record -> stop -> playback done`);
}

async function runSWJourney(browser, viewport, name) {
  const { ctx, page } = await newContext(browser, viewport, name);
  const W = { errors: 0, checks: [] };
  let attemptId = null, token = null;
  const seen = new Set();
  const shot = async (key, label) => {
    if (seen.has(key)) return;
    seen.add(key);
    await page.screenshot({ path: `${EV}/${key}-${name}.png` });
    log(name, `SCREENSHOT ${label} -> ${key}-${name}.png`);
  };
  try {
    await login(page);
    log(name, 'STEP logged in as seed.owner');
    token = await page.evaluate(() => localStorage.getItem('token'));

    // catalog -> SW exam
    await page.goto(`${BASE}/thi-thu`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Thư viện đề thi', { timeout: 12000 });
    await shot('sw-catalog', 'SW catalog');
    await page.locator('button:has-text("Speaking & Writing")').click();
    await page.waitForSelector('text=Anish Full Practice 1 — Speaking & Writing', { timeout: 12000 });
    await page.locator('button:has-text("Thi thử")').first().click();
    await page.waitForSelector('button:has-text("Bắt đầu")', { timeout: 12000 });
    await page.locator('button:has-text("Bắt đầu")').click();
    await page.waitForURL(/lam-bai-sw/, { timeout: 15000 });
    const m = page.url().match(/lam-bai-sw\/(\d+)/);
    attemptId = m ? m[1] : null;
    check(W, !!attemptId, `SW attempt created from catalog (id=${attemptId})`);
    log(name, `STEP SW attempt created via catalog: ${attemptId}`);

    // mic setup
    await page.waitForSelector('text=Microphone Setup', { timeout: 15000 });
    await shot('sw-mic', 'SW microphone setup');
    await page.locator('button:has-text("Allow Microphone Access")').click();
    await page.waitForSelector('button:has-text("Continue to Test")', { timeout: 15000 });
    await page.locator('button:has-text("Continue to Test")').click();
    log(name, 'STEP mic granted');

    // directions -> prep -> speaking q22
    await page.waitForSelector('text=DIRECTIONS', { timeout: 10000 });
    await page.locator('button:has-text("BẮT ĐẦU")').click();
    await page.locator('button:has-text("Bắt đầu chuẩn bị")').waitFor({ timeout: 8000 });
    await page.locator('button:has-text("Bắt đầu chuẩn bị")').click();
    await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
    await page.locator('button:has-text("Bỏ qua chuẩn bị")').click();
    await page.locator('button[aria-label="Start recording"]').waitFor({ timeout: 5000 });
    await shot('sw-speaking', 'SW speaking question (recording ready)');

    // speaking q22/q23/q24
    await recordSpeaking(page, name, 'q22');
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.locator('button[aria-label="Start recording"]').waitFor({ timeout: 8000 });
    await recordSpeaking(page, name, 'q23');
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.locator('button[aria-label="Start recording"]').waitFor({ timeout: 8000 });
    await recordSpeaking(page, name, 'q24');
    log(name, 'STEP all 3 speaking questions (q22-24) recorded');

    // writing q25 / q26
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('.ql-editor', { timeout: 10000 });
    const essayQ25 = 'Dear Ms. Tran,\n\nI would like to request two days of leave next month to help my family move to a new house.\nI will finish all pending tasks before the leave and my colleague will cover urgent requests.\n\nThank you.\nBest regards, Linh.';
    await typing(page, essayQ25);
    await page.waitForTimeout(2000);
    const wc = await page.locator('text=Từ:').textContent();
    check(W, wc && parseInt(wc.replace(/\D/g, ''), 10) >= 40, 'writing q25 word count >= 40', wc || '');
    await shot('sw-writing', 'SW writing q25 (word count)');
    log(name, `STEP writing q25 typed, word count: ${wc}`);
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('.ql-editor', { timeout: 10000 });
    await typing(page, 'I visited Green Bowl last week. The food was fresh and the staff were friendly. I suggest adding an online reservation system so customers can book in advance.');
    await page.waitForTimeout(2000);
    log(name, 'STEP writing q25-26 answered');

    // submit -> processing
    await page.locator('button:has-text("NỘP BÀI")').click();
    await page.waitForURL(/dang-xu-ly/, { timeout: 30000 });
    await page.waitForTimeout(700);
    const procText = await page.locator('body').innerText();
    check(W, /Đang/.test(procText) || /chấm/.test(procText), 'ProcessingPage progress UI rendered');
    await shot('sw-processing', 'SW processing page');
    log(name, 'STEP submitted -> ProcessingPage');

    // processing -> result (auto-navigate on COMPLETED)
    await page.waitForURL(/ket-qua\/\d+/, { timeout: 60000 });
    await page.waitForSelector('text=AI GRADING RESULT', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const resText = await page.locator('body').innerText();
    check(W, /AI GRADING RESULT/.test(resText), 'SW certificate header');
    check(W, /TOTAL SCORE/.test(resText), 'certificate TOTAL SCORE section');
    check(W, /400/.test(resText), 'totalScore 400 shown');
    check(W, /FINAL/.test(resText), 'status FINAL shown');
    check(W, (/Speaking|SPEAKING/.test(resText)) && (/Writing|WRITING/.test(resText)), 'Speaking + Writing sections');
    const res = await api(token, 'GET', `/toeic-attempts/${attemptId}/result`);
    check(W, res.body?.totalScore === 400, `SW totalScore=400 (got ${res.body?.totalScore})`);
    check(W, res.body?.status === 'FINAL', 'SW result status FINAL');
    await shot('sw-result', 'SW result certificate');
    log(name, `STEP SW result verified (totalScore=${res.body?.totalScore}, status=${res.body?.status})`);

    // review detail (5 rows)
    await page.locator('a[href*="chi-tiet"], button:has-text("Xem lại bài thi")').first().click();
    await page.waitForURL(/chi-tiet/, { timeout: 15000 });
    await page.waitForSelector('text=Xem lại bài thi', { timeout: 15000 });
    await page.waitForTimeout(800);
    const revText = await page.locator('body').innerText();
    check(W, /CÂU HỎI/.test(revText) && /BÀI LÀM CỦA BẠN/.test(revText), 'review per-question blocks');
    check(W, /SPEAKING/.test(revText) && /WRITING/.test(revText), 'SPEAKING/WRITING tags');
    check(W, revText.includes('I would like to request two days of leave'), 'writing textResponse shown');
    check(W, /Câu 1/.test(revText) && /Câu 5/.test(revText), 'all 5 questions listed');
    const rv = await api(token, 'GET', `/toeic-attempts/${attemptId}/review`);
    check(W, Array.isArray(rv.body) && rv.body.length === 5, `review rows=5 (got ${rv.body?.length})`);
    await shot('sw-review', 'SW review detail');
    log(name, 'STEP review detail verified (5 rows)');

    // history
    await page.goto(`${BASE}/thi-thu/lich-su`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Lịch Sử Luyện Tập', { timeout: 15000 });
    await page.waitForTimeout(1000);
    const hist = await page.locator('body').innerText();
    check(W, hist.includes(`ID: ${attemptId}`), `attempt ${attemptId} in history`);
    check(W, /Hoàn thành/.test(hist), 'COMPLETED status chip (Hoàn thành)');
    const link = page.locator(`a[href="/thi-thu/ket-qua/${attemptId}"]`);
    check(W, (await link.count()) > 0, 'Xem kết quả link present');
    await shot('sw-history', 'SW history');
    const at = await api(token, 'GET', `/toeic-attempts/${attemptId}`);
    check(W, at.body?.status === 'COMPLETED', 'attempt status COMPLETED');
    log(name, `STEP history verified (attempt ${attemptId} COMPLETED)`);
    return { W, attemptId, token };
  } catch (err) {
    console.error(`[${name}] UNHANDLED SW ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { check(W, false, 'sw journey error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220)); } catch { /* noop */ }
    if (!token) { try { token = await page.evaluate(() => localStorage.getItem('token')); } catch { /* page gone */ } }
    return { W, attemptId, token };
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const desktop = await runSWJourney(browser, VIEWPORTS.desktop, 'desktop');
const mobile = await runSWJourney(browser, VIEWPORTS.mobile, 'mobile');
await browser.close();

const now = new Date().toISOString();
const CHECK = (W) => `PASS=${W.checks.filter((c) => c.startsWith('PASS')).length} FAIL=${W.checks.filter((c) => c.startsWith('FAIL')).length}`;

function render(name, label, r) {
  return [
    `S7 synthetic SW journey (${label}) — viewport ${JSON.stringify(VIEWPORTS[name])}`,
    `timestamp: ${now}`,
    `attemptId: ${r.attemptId ?? 'n/a'}`,
    `errors: ${r.W.errors}`,
    `CHECKLIST | AC21 (sw, ${name}) | ${CHECK(r.W)}`,
    ...r.W.checks.map((c) => `  ${c}`),
    '',
    'STEP transcript:',
    ...out[name],
  ].join('\n');
}

writeFileSync(`${EV}/synthetic-sw-desktop.txt`, render('desktop', 'AC21 SW', desktop));
writeFileSync(`${EV}/synthetic-sw-mobile.txt`, render('mobile', 'AC21 SW', mobile));
const fs = await import('fs');
fs.appendFileSync(`${EV}/console-network.txt`, [
  '',
  '=== SW DESKTOP console ===', ...consoleLog.desktop,
  '', '=== SW MOBILE console ===', ...consoleLog.mobile,
  '', '=== SW DESKTOP network (/api) ===', ...network.desktop,
  '', '=== SW MOBILE network (/api) ===', ...network.mobile,
].join('\n'));

console.log('\n--- S7 SW JOURNEY SUMMARY ---');
for (const [n, r] of Object.entries({ desktop, mobile })) {
  console.log(`${n}: ${CHECK(r.W)} attemptId=${r.attemptId ?? '-'}`);
  for (const c of r.W.checks.filter((x) => x.startsWith('FAIL'))) console.log(`  ${c}`);
}
console.log('evidence written to', EV);
process.exit(desktop.W.errors + mobile.W.errors ? 1 : 0);
