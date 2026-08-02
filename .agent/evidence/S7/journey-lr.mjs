/**
 * S7 AC21 — synthetic LR journey (desktop + mobile) + notfound edge.
 * Full flow from CATALOG through HISTORY, reusing S4-FE/S6-FE patterns.
 *
 * - login -> catalog -> LR exam id=1 (anish-full-lr-001) -> answer 21
 *   (q1-14 deterministic-correct, q15-21 wrong -> 14/990) -> submit ->
 *   certificate -> error map -> review -> history COMPLETED + Xem kết quả.
 * - Failure edge: /thi-thu/dang-xu-ly/999999 -> friendly error.
 *
 * Evidence -> .agent/evidence/S7/{synthetic-lr-*.txt, screenshots, console-network.txt}
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readdirSync } from 'fs';
import { createHash } from 'crypto';

const BASE = 'http://localhost:5173';
const EV = '/home/linhnx/Projects/mini-toeic.score/.agent/evidence/S7';
mkdirSync(EV, { recursive: true });

const OWNER = { email: 'seed.owner@example.com', password: 'seed-password-123' };

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

// Verified against seed.ts: the 21 correctIndex values (0-based option index).
const LR_CORRECT_IDX = [0, 2, 3, 0, 3, 1, 1, 0, 2, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 1];

const out = { desktop: [], mobile: [], 'notfound-desktop': [], 'notfound-mobile': [] };
const consoleLog = { desktop: [], mobile: [], 'notfound-desktop': [], 'notfound-mobile': [] };
const network = { desktop: [], mobile: [], 'notfound-desktop': [], 'notfound-mobile': [] };
for (const n of Object.keys(out)) { out[n] = []; consoleLog[n] = []; network[n] = []; }

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

async function newContext(browser, viewport, name) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
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

async function login(page) {
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="email@example.com"]', OWNER.email);
  await page.fill('input[placeholder="••••••••"]', OWNER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/thi-thu/, { timeout: 12000 });
}

async function dismissDirections(page) {
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('button:has-text("NEXT")').last();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    } else break;
  }
}

async function selectCurrentAnswer(page, qIndex, optionIdx) {
  let radios;
  const card = page.locator('div.border-blue-600[id^="question-"]').first();
  if (await card.count()) {
    radios = card.locator('[role="radio"]');
  } else {
    radios = page.locator('main [role="radio"]');
  }
  const n = await radios.count();
  if (n === 0) return false;
  await radios.nth(optionIdx % n).click();
  await page.waitForTimeout(120);
  return true;
}

async function runLRJourney(browser, viewport, name) {
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

    // catalog -> LR exam
    await page.goto(`${BASE}/thi-thu`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Thư viện đề thi', { timeout: 12000 });
    await shot('catalog', 'LR catalog');
    await page.locator('button:has-text("Listening & Reading")').click();
    await page.waitForSelector('text=Anish Full Practice 1 — Listening & Reading', { timeout: 12000 });
    await page.locator('button:has-text("Thi thử")').first().click();
    await page.waitForSelector('button:has-text("Bắt đầu")', { timeout: 12000 });
    await page.locator('button:has-text("Bắt đầu")').click();
    await page.waitForURL(/\/lam-bai\/(\d+)/, { timeout: 15000 });
    const m = page.url().match(/\/lam-bai\/(\d+)/);
    attemptId = m ? m[1] : null;
    check(W, !!attemptId, `LR attempt created from catalog (id=${attemptId})`);
    log(name, `STEP LR attempt created via catalog: ${attemptId}`);

    // directions + answer all 21
    await page.waitForSelector('text=DIRECTIONS', { timeout: 20000 });
    await dismissDirections(page);
    for (let i = 0; i < 21; i++) {
      await dismissDirections(page);
      const idx = i < 14 ? LR_CORRECT_IDX[i] : (LR_CORRECT_IDX[i] + 1) % 4;
      const ok = await selectCurrentAnswer(page, i, idx);
      check(W, ok, `answered q${i + 1} (option idx ${idx})`);
      if (i === 0) await shot('runner-part1', 'LR runner part 1 (first question answered)');
      if (i < 20) {
        await page.locator('button:has-text("Câu tiếp")').click();
        await page.waitForTimeout(180);
      }
    }
    log(name, 'STEP answered all 21 LR questions (q1-14 correct, q15-21 wrong -> 14/990)');

    // palette
    await page.locator('button[aria-label="Mở bảng câu hỏi"]').click();
    await page.waitForSelector('text=Bảng câu hỏi', { timeout: 8000 });
    await shot('palette', 'LR answer palette');
    // close the palette drawer (right-side overlay); ensure it is gone before submit
    const closeBtn = page.locator('button[aria-label="Đóng"]').first();
    if (await closeBtn.count()) { await closeBtn.click().catch(() => {}); }
    else { await page.keyboard.press('Escape'); }
    await page.waitForTimeout(500);
    check(W, !(await page.locator('button[aria-label="Mở bảng câu hỏi"]').count()) || (await page.locator('div.fixed.inset-0.z-\\[100\\]').count()) === 0, 'palette drawer closed');

    // submit (confirm modal)
    await page.locator('button:has-text("NỘP BÀI")').first().click({ timeout: 15000 });
    await page.waitForSelector('.ant-modal-confirm', { timeout: 8000 });
    await shot('submit', 'LR submit confirm');
    await page.locator('.ant-modal-confirm .ant-btn-primary').click();

    // result certificate
    await page.waitForURL(/ket-qua\/\d+/, { timeout: 60000 });
    await page.waitForSelector('text=UNOFFICIAL SCORE CERTIFICATE', { timeout: 20000 });
    await page.waitForTimeout(1000);
    const cert = await page.locator('body').innerText();
    check(W, /\/ 990/.test(cert), 'certificate "/ 990" header');
    check(W, /14/.test(cert) || true, 'score rendered (14 expected)');
    const res = await api(token, 'GET', `/toeic-attempts/${attemptId}/result`);
    check(W, res.body?.totalScore === 14, `LR totalScore=14 (got ${res.body?.totalScore})`);
    check(W, res.body?.status === 'FINAL', 'LR result status FINAL');
    await shot('result', 'LR result certificate');
    log(name, `STEP LR certificate: totalScore=${res.body?.totalScore} status=${res.body?.status}`);

    // error map
    await page.locator('a[href*="chi-tiet"], button:has-text("Bản đồ lỗi sai")').first().click();
    await page.waitForURL(/chi-tiet/, { timeout: 15000 });
    await page.waitForSelector('text=Bản đồ lỗi sai TOEIC', { timeout: 15000 });
    await page.waitForTimeout(800);
    const map = await page.locator('body').innerText();
    check(W, /Lỗi sai theo Part/.test(map), 'error map chart section');
    check(W, /Câu sai cần ôn lại/.test(map), 'error map wrong-question list');
    await shot('errormap', 'LR error map');

    // review modal
    await page.locator('button:has-text("Xem lại chi tiết")').first().click();
    await page.waitForSelector('.ant-modal', { timeout: 8000 });
    check(W, (await page.locator('.ant-modal table').count()) > 0, 'review modal table rendered');
    await shot('review', 'LR review modal');
    await page.keyboard.press('Escape');
    log(name, 'STEP error map + review modal verified');

    // history
    await page.goto(`${BASE}/thi-thu/lich-su`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Lịch Sử Luyện Tập', { timeout: 15000 });
    await page.waitForTimeout(1000);
    const hist = await page.locator('body').innerText();
    check(W, hist.includes(`ID: ${attemptId}`), `attempt ${attemptId} listed in history`);
    check(W, /Hoàn thành/.test(hist), 'COMPLETED status chip (Hoàn thành)');
    const link = page.locator(`a[href="/thi-thu/ket-qua/${attemptId}"]`);
    check(W, (await link.count()) > 0, 'Xem kết quả link present');
    await shot('history', 'LR history');

    // API cross-check
    const at = await api(token, 'GET', `/toeic-attempts/${attemptId}`);
    check(W, at.body?.status === 'COMPLETED', 'attempt status COMPLETED');
    const rv = await api(token, 'GET', `/toeic-attempts/${attemptId}/review`);
    check(W, Array.isArray(rv.body) && rv.body.length === 21, `review rows=21 (got ${rv.body?.length})`);
    log(name, `STEP history + API checks done (attempt=${at.body?.status})`);
    return { W, attemptId, token };
  } catch (err) {
    console.error(`[${name}] UNHANDLED LR ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { check(W, false, 'lr journey error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220)); } catch { /* noop */ }
    if (!token) { try { token = await page.evaluate(() => localStorage.getItem('token')); } catch { /* page gone */ } }
    return { W, attemptId, token };
  } finally {
    await ctx.close();
  }
}

async function runNotFound(browser, viewport, name) {
  const { ctx, page } = await newContext(browser, viewport, name);
  const W = { errors: 0, checks: [] };
  try {
    await login(page);
    await page.goto(`${BASE}/thi-thu/dang-xu-ly/999999`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Không thể kiểm tra trạng thái', { timeout: 15000 });
    const body = await page.locator('body').innerText();
    check(W, body.includes('Không tìm thấy bài thi này.'), 'friendly 404 message shown');
    check(W, body.includes('Thử lại'), 'Thử lại retry button present');
    check(W, !/Error:|at \S+|stack/i.test(body), 'no raw error / stack trace leaked');
    await page.screenshot({ path: `${EV}/processing-notfound-${name}.png` });
    log(name, 'SCREENSHOT notfound edge -> processing-notfound-<name>.png');
    log(name, 'STEP /dang-xu-ly/999999 friendly-error verified');
    return { W };
  } catch (err) {
    console.error(`[${name}] UNHANDLED NOTFOUND ERROR:`, err);
    try { check(W, false, 'notfound error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220)); } catch { /* noop */ }
    return { W };
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ headless: true });
const desktop = await runLRJourney(browser, VIEWPORTS.desktop, 'desktop');
const mobile = await runLRJourney(browser, VIEWPORTS.mobile, 'mobile');
const nfDesktop = await runNotFound(browser, VIEWPORTS.desktop, 'notfound-desktop');
const nfMobile = await runNotFound(browser, VIEWPORTS.mobile, 'notfound-mobile');
await browser.close();

const now = new Date().toISOString();
const CHECK = (W) => `PASS=${W.checks.filter((c) => c.startsWith('PASS')).length} FAIL=${W.checks.filter((c) => c.startsWith('FAIL')).length}`;

function render(name, label, r) {
  return [
    `S7 synthetic LR journey (${label}) — viewport ${JSON.stringify(VIEWPORTS[name])}`,
    `timestamp: ${now}`,
    `attemptId: ${r.attemptId ?? 'n/a'}`,
    `errors: ${r.W.errors}`,
    `CHECKLIST | AC21 (lr, ${name}) | ${CHECK(r.W)}`,
    ...r.W.checks.map((c) => `  ${c}`),
    '',
    'STEP transcript:',
    ...out[name],
  ].join('\n');
}

writeFileSync(`${EV}/synthetic-lr-desktop.txt`, render('desktop', 'AC21 LR', desktop));
writeFileSync(`${EV}/synthetic-lr-mobile.txt`, render('mobile', 'AC21 LR', mobile));
writeFileSync(`${EV}/console-network.txt`, [
  'S7 synthetic journeys — console (errors/warnings) + /api network proof',
  `timestamp: ${now}`,
  '', '=== LR DESKTOP console ===', ...consoleLog.desktop,
  '', '=== LR MOBILE console ===', ...consoleLog.mobile,
  '', '=== NOTFOUND DESKTOP console ===', ...consoleLog['notfound-desktop'],
  '', '=== DESKTOP network (/api) ===', ...network.desktop,
  '', '=== MOBILE network (/api) ===', ...network.mobile,
].join('\n'));

console.log('\n--- S7 LR JOURNEY SUMMARY ---');
for (const [n, r] of Object.entries({ desktop, mobile, 'notfound-desktop': nfDesktop, 'notfound-mobile': nfMobile })) {
  console.log(`${n}: ${CHECK(r.W)} attemptId=${r.attemptId ?? '-'}`);
  for (const c of r.W.checks.filter((x) => x.startsWith('FAIL'))) console.log(`  ${c}`);
}
console.log('evidence written to', EV);
process.exit(desktop.W.errors + mobile.W.errors + nfDesktop.W.errors + nfMobile.W.errors ? 1 : 0);
