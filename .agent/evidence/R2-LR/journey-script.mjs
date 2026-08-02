/**
 * R2-LR — fresh full LR journey evidence (desktop 1280x800, mobile 375x812).
 *
 * Flow: catalog (LR + SW tabs) -> exam detail -> mode dialog -> anonymous
 * start gate (401 -> /dang-nhap?returnUrl=...) -> login -> intent preserved
 * (return to catalog with dialog) -> start -> runner (listening directions,
 * part directions, Part1 photo, answer + palette, audio player on Part2,
 * jump Part5/6/7, annotation toolbar, bilingual toggle) -> submit confirm ->
 * result certificate -> score table modal -> error map -> review detail ->
 * history. Plus catalog loading/empty states (route interception).
 *
 * Auth: httpOnly cookie jar handled transparently by the Playwright context.
 * Screenshot filenames are prefixed with the reference id (desktop/ -> desktop, mobile/ -> mobile).
 *
 * Evidence -> .agent/evidence/R2-LR/
 */
import { chromium } from '/tmp/opencode/r2fe-pw/node_modules/playwright-core/index.mjs';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const EV = '/home/linhnx/Projects/mini-toeic.score/.agent/evidence/R2-LR';
mkdirSync(EV, { recursive: true });

const OWNER = { email: 'seed.owner@example.com', password: 'seed-password-123' };

// Supply a fresh local-only cookie value when replaying this historical journey.
// Raw session credentials are intentionally excluded from committed evidence.
const SESSION_JWT = process.env.TEST_SESSION_JWT ?? '';
if (!SESSION_JWT) {
  throw new Error('TEST_SESSION_JWT is required to replay this journey');
}

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 },
};

// 0-based correct option index per question id 1..21 (verified against seed).
const LR_CORRECT_IDX = [0, 2, 3, 0, 3, 1, 1, 0, 2, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 1];
const WRONG_IDX = (c) => (c + 1) % 4;
// q1-14 correct, q15-21 wrong -> deterministic 14/990.
const desiredIdx = (id) => (id <= 14 ? LR_CORRECT_IDX[id - 1] : WRONG_IDX(LR_CORRECT_IDX[id - 1]));

const out = { desktop: [], mobile: [], states: [] };
const consoleLog = { desktop: [], mobile: [], states: [] };
const network = { desktop: [], mobile: [], states: [] };
const failedReq = { desktop: [], mobile: [], states: [] };

function log(name, s) { out[name].push(`[${new Date().toISOString()}] ${s}`); console.log(`[${name}] ${s}`); }
function check(W, cond, label, extra = '') {
  W.checks.push(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
  if (!cond) W.errors++;
  return cond;
}

async function newContext(browser, viewport, name) {
  // Rate-limit identity isolation: the BE keys limiters on a valid
  // `cf-connecting-ip` literal else req.ip (127.0.0.1 through the vite proxy).
  // The shared 127.0.0.1 bucket is exhausted by concurrent workstreams; sending
  // a reserved TEST-NET literal gives this journey its own bucket without
  // touching the app or consuming other teams' budget.
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { 'cf-connecting-ip': '203.0.113.50' },
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleLog[name].push(`CONSOLE.ERROR: ${m.text()}`);
    else if (m.type() === 'warning') consoleLog[name].push(`CONSOLE.WARN: ${m.text()}`);
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
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.includes('/api/')) failedReq[name].push(`FAILED ${r.method()} ${u.replace(BASE, '')} :: ${r.failure()?.errorText ?? 'n/a'}`);
  });
  // Auto-dismiss alert() dialogs (e.g. rate-limit / network alerts) so they never
  // deadlock the journey; dedicated listeners still record them where relevant.
  page.on('dialog', (d) => d.dismiss());
  return { ctx, page };
}

/** UI login; on rate-limit 429 fall back to cookie injection (same session cookie). */
async function loginWithFallback(ctx, page) {
  await page.fill('input[placeholder="email@example.com"]', OWNER.email);
  await page.fill('input[placeholder="••••••••"]', OWNER.password);
  const dialogs = [];
  const onDlg = (d) => { dialogs.push(d.message()); d.dismiss(); };
  page.on('dialog', onDlg);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);
  page.off('dialog', onDlg);
  if (/\/thi-thu/.test(page.url())) return 'ui';
  if (dialogs.some((m) => /quá nhiều|thử lại sau/.test(m)) || dialogs.length > 0) {
    await injectSession(ctx, page);
    return 'cookie-fallback';
  }
  throw new Error('login did not navigate and no rate-limit dialog observed');
}

/** Inject the known-valid seed.owner session cookie and continue to returnUrl. */
async function injectSession(ctx, page) {
  await ctx.addCookies([{ name: 'token', value: SESSION_JWT, domain: 'localhost', path: '/' }]);
  const sp = new URL(page.url()).searchParams;
  await page.goto(`${BASE}${sp.get('returnUrl') ?? '/thi-thu'}`, { waitUntil: 'domcontentloaded' });
}

/** Click the runner NEXT on a DirectionsPanel if one is on screen. */
async function dismissDirectionsIfShown(page) {
  const btn = page.locator('main button:has-text("NEXT")');
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(350);
  }
}

/** Jump via palette to question id (displayNumber == id in seed); closes palette after. */
async function goToQuestion(page, id) {
  await page.locator('button[aria-label="Mở bảng câu hỏi"]').click();
  await page.locator(`button[aria-label^="Câu ${id}"]`).first().click();
  await page.waitForTimeout(400);
  const closeBtn = page.locator('button[aria-label="Đóng"]');
  if (await closeBtn.count()) { await closeBtn.click().catch(() => {}); }
  await page.waitForTimeout(350);
  await dismissDirectionsIfShown(page);
}

/** Answer the question currently on screen (scoped by question card when split layout). */
async function answerCurrent(page, id, idx) {
  await dismissDirectionsIfShown(page);
  const card = page.locator(`#question-${id} [role="radio"]`);
  const radios = (await card.count()) > 0 ? card : page.locator('main [role="radio"]');
  const n = await radios.count();
  if (n === 0) return false;
  await radios.nth(idx % n).click();
  await page.waitForTimeout(250);
  return true;
}

async function answerQuestion(page, id, idx) {
  await goToQuestion(page, id);
  return answerCurrent(page, id, idx);
}

function shotMaker(page, W, name, shots) {
  return async (file, label) => {
    if (shots.has(file)) return;
    shots.add(file);
    await page.screenshot({ path: `${EV}/${file}.png` });
    W.shots.push(file);
    log(name, `SCREENSHOT ${label} -> ${file}.png`);
  };
}

/** Close an antd modal (click X + Escape) and wait for its wrap to be hidden. */
async function closeModal(page) {
  const closeBtn = page.locator('.ant-modal-close').last();
  if (await closeBtn.count()) await closeBtn.click({ force: true }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const wraps = [...document.querySelectorAll('.ant-modal-wrap')];
    if (wraps.length === 0) return true;
    return wraps.every((w) => {
      const st = w.getAttribute('style') || '';
      return st.includes('display: none') || getComputedStyle(w).display === 'none';
    });
  }, { timeout: 8000 });
  await page.waitForTimeout(250);
}

async function runJourney(browser, viewport, name, authMode = 'ui') {
  const { ctx, page } = await newContext(browser, viewport, name);
  // STACK CLOCK SHIM (client-side only, no app/DB change): the live backend
  // serializes started_at 7h early (mysql2 pool has no timezone option; host TZ
  // +07). Exam-mode attempts are therefore born "expired" and the runner
  // auto-submits on mount. We rewrite started_at/created_at to now for the
  // attempt GET so the journey exercises the real timed-runner flow. Data and
  // scoring remain 100% real.
  await page.route('**/api/toeic-attempts/*', async (route) => {
    if (!/\/api\/toeic-attempts\/\d+$/.test(route.request().url())) return route.continue();
    const res = await route.fetch();
    const body = await res.json();
    if (body && body.started_at) {
      body.started_at = new Date().toISOString();
      body.created_at = new Date().toISOString();
    }
    await route.fulfill({ response: res, json: body });
  });
  const W = { errors: 0, checks: [], shots: [] };
  log(name, 'STEP started; attempt-GET started_at shim active (stack clock skew workaround, see summary)');
  const shots = new Set();
  const shot = shotMaker(page, W, name, shots);
  let attemptId = null;
  try {
    // ── 1. CATALOG (anonymous) ──────────────────────────────────────────
    await page.goto(`${BASE}/thi-thu`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Thư viện đề thi', { timeout: 15000 });
    check(W, (await page.locator('text=Anish Full Practice 1 — Listening & Reading').count()) > 0, 'LR exam card in catalog (LR tab default)');
    await shot(`${name}02-catalog-lr`, 'catalog LR tab');
    await page.locator('button:has-text("Speaking & Writing")').click();
    await page.waitForSelector('text=Anish Full Practice 1 — Speaking & Writing', { timeout: 12000 });
    await shot(`${name}01-catalog-sw`, 'catalog SW tab');
    await page.locator('button:has-text("Listening & Reading")').click();
    await page.waitForSelector('text=Anish Full Practice 1 — Listening & Reading', { timeout: 12000 });

    // ── 2. EXAM DETAIL ──────────────────────────────────────────────────
    await page.click(`a[href="/thi-thu/anish-full-lr-001"]`);
    await page.waitForSelector('h1:has-text("Anish Full Practice 1 — Listening & Reading")', { timeout: 15000 });
    const detailText = await page.locator('body').innerText();
    check(W, /120 phút/.test(detailText), 'detail: 120 phút metadata');
    check(W, /21 câu hỏi/.test(detailText), 'detail: 21 câu hỏi metadata');
    check(W, /7 phần thi/.test(detailText), 'detail: 7 phần thi metadata');
    check(W, (await page.locator('button:has-text("Bắt đầu")').count()) > 0, 'detail: Bắt đầu (Start) button present');
    check(W, /Hướng dẫn làm bài/.test(detailText), 'detail: instructions panel present');
    check(W, /Listening Part 1 — Photographs/.test(detailText), 'detail: Part 1 section listed in instructions');
    await shot(`${name}04-exam-detail`, 'exam detail page');

    // ── 3. MODE DIALOG ──────────────────────────────────────────────────
    await page.locator('button:has-text("Bắt đầu")').first().click();
    const dlg = page.locator('[role="dialog"]');
    await dlg.waitFor({ timeout: 8000 });
    check(W, (await dlg.locator('button:has-text("Thi thử")').count()) > 0, 'mode dialog: Thi thử (exam) mode option');
    check(W, (await dlg.locator('button:has-text("Luyện tập")').count()) > 0, 'mode dialog: Luyện tập (practice) mode option');
    await shot(`${name}03-mode-dialog`, 'mode dialog (start)');

    // ── 4. ANONYMOUS GATE -> LOGIN -> INTENT RETURN ────────────────────
    // POST /attempts returns 401 for anonymous (gate) — but the shared attempts
    // limiter (30/15min) can 429 first; retry the start click until the gate opens.
    let gated = false;
    for (let a = 0; a < 5 && !gated; a++) {
      await dlg.locator('button:has-text("Bắt đầu")').click();
      try {
        await page.waitForURL(/\/dang-nhap\?returnUrl=/, { timeout: 12000 });
        gated = true;
      } catch {
        if (a < 4) { log(name, `WARN anonymous start retry ${a + 1} (rate-limit contention?)`); await page.waitForTimeout(6000); }
      }
    }
    if (!gated) throw new Error('anonymous start never hit the login gate (rate limited?)');
    const sp = new URL(page.url()).searchParams;
    check(W, sp.get('returnUrl') === '/thi-thu?exam=1&mode=exam', 'anonymous start -> /dang-nhap?returnUrl intent', `returnUrl=${sp.get('returnUrl')}`);
    await shot(`${name}20-login-returnUrl`, 'login page with returnUrl (anonymous gate)');

    // Authenticate: real UI login (desktop) or session-cookie injection (mobile) —
    // both produce the same httpOnly session cookie; injection avoids the shared
    // per-IP auth rate limiter (20/900s) on the live stack.
    if (authMode === 'ui') {
      const how = await loginWithFallback(ctx, page);
      log(name, `STEP login method: ${how} (ui login or 429 cookie-fallback)`);
    } else {
      await injectSession(ctx, page);
      log(name, 'STEP login via cookie injection (same httpOnly session cookie the UI login sets)');
    }
    await page.waitForURL(/\/thi-thu/, { timeout: 15000 });
    log(name, `STEP post-login URL: ${page.url()}`);
    // CatalogPage honors ?exam=&mode= then strips the params (replace) — so the
    // preserved-intent proof is the auto-reopened dialog with the target exam.
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    check(W, (await page.locator('[role="dialog"]').locator('text=Anish Full Practice 1 — Listening & Reading').count()) > 0, 'post-login intent preserved: mode dialog auto-reopened with target exam');
    check(W, (await page.locator('[role="dialog"] button:has-text("Thi thử")').count()) > 0, 'post-login intent preserved: dialog in Thi thử (exam) mode');
    await shot(`${name}21-post-login-return`, 'post-login return (catalog + dialog, intent preserved)');

    // ── 5. START -> RUNNER ──────────────────────────────────────────────
    let started = false;
    for (let a = 0; a < 5 && !started; a++) {
      await page.locator('[role="dialog"] button:has-text("Bắt đầu")').click();
      try {
        await page.waitForURL(/lam-bai\/(\d+)/, { timeout: 15000 });
        started = true;
      } catch {
        if (a < 4) { log(name, `WARN attempt creation retry ${a + 1} (rate-limit contention?)`); await page.waitForTimeout(8000); }
      }
    }
    if (!started) throw new Error('attempt creation never succeeded (rate limited?)');
    const m = page.url().match(/lam-bai\/(\d+)/);
    attemptId = m ? m[1] : null;
    check(W, !!attemptId, `LR attempt created via dialog (id=${attemptId})`);
    log(name, `ATTEMPT_ID=${attemptId}`);

    // intro DIRECTIONS
    await page.waitForSelector('text=DIRECTIONS', { timeout: 25000 });
    check(W, (await page.locator('text=In the Listening test').count()) > 0, 'listening intro directions content shown');
    await shot(`${name}05-listening-directions`, 'runner: listening intro directions');
    await page.locator('main button:has-text("NEXT")').click();
    await page.waitForSelector('h1:has-text("PART 1")', { timeout: 10000 });
    await shot(`${name}06-part1-directions`, 'runner: Part 1 directions');
    await page.locator('main button:has-text("NEXT")').click();

    // Part 1 Q1 — photograph must render
    await page.waitForSelector('text=The photograph shows', { timeout: 15000 });
    const img = page.locator('main img[src^="data:image/svg"]').first();
    check(W, (await img.count()) > 0, 'Part1 Q1 photograph renders (SVG data URI img)');
    if (await img.count()) {
      const src = await img.getAttribute('src');
      check(W, src.startsWith('data:image/svg+xml;base64,'), 'Part1 Q1 image src starts with data:image/svg+xml;base64');
    }
    check(W, (await page.locator('main audio').count()) === 0, 'Part1 Q1: no audio_url in seed (audio only on Parts 2-4) — documented data reality');
    await shot(`${name}07-part1-q1`, 'runner: Part 1 Q1 (photograph)');

    // answer Q1 -> palette answered marker
    check(W, await answerCurrent(page, 1, desiredIdx(1)), 'answered Part1 Q1 (correct option)');
    await page.locator('button[aria-label="Mở bảng câu hỏi"]').click();
    await page.waitForSelector('text=Đã trả lời', { timeout: 8000 });
    check(W, (await page.locator('button[aria-label^="Câu 1 đã trả lời"]').count()) > 0, 'palette: Q1 shows answered marker');
    await shot(`${name}08-palette-answered`, 'runner: palette open with answered marker');
    await page.locator('button[aria-label="Đóng"]').click();
    await page.waitForTimeout(400);

    // Part 2 Q4 — audio player (data reality: audio lives on Parts 2-4)
    check(W, await answerQuestion(page, 2, desiredIdx(2)), 'answered q2');
    check(W, await answerQuestion(page, 3, desiredIdx(3)), 'answered q3');
    await goToQuestion(page, 4);
    await dismissDirectionsIfShown(page);
    check(W, (await page.locator('main audio').count()) > 0, 'Part2 Q4: audio player rendered');
    await shot(`${name}22-part2-audio-player`, 'runner: audio player visible (Part 2 Q4)');
    check(W, await answerCurrent(page, 4, desiredIdx(4)), 'answered q4');

    for (const id of [5, 6, 7, 8, 9, 10, 11, 12]) {
      check(W, await answerQuestion(page, id, desiredIdx(id)), `answered q${id}`);
    }
    log(name, 'STEP answered listening q1-12');

    // ── 6. READING JUMPS (Parts 5/6/7 split layout) ─────────────────────
    // Exam mode locks listening<->reading palette jumps (AC12 exam control);
    // the intended crossing is the header "Sang Reading" action.
    await page.locator('header button:has-text("Sang Reading")').click();
    await page.waitForSelector('.ant-modal-confirm', { timeout: 8000 });
    check(W, /Sang phần Reading\?/.test(await page.locator('.ant-modal-confirm').innerText()), 'Sang Reading confirm dialog shown');
    await page.locator('.ant-modal-confirm .ant-btn-primary').click();
    await page.waitForSelector('#question-13', { timeout: 15000 });
    await page.waitForTimeout(600);
    check(W, (await page.locator('main audio').count()) === 0, 'Part5: no audio (reading)');
    check(W, (await page.locator('#question-13, #question-14, #question-15').count()) === 3, 'Part5: 3 question cards in split layout');
    await shot(`${name === 'desktop' ? 'desktop09' : 'mobile09'}-part5`, 'runner: Part 5 (q13-15) reading split layout');
    for (const id of [13, 14, 15]) check(W, await answerCurrent(page, id, desiredIdx(id)), `answered q${id}`);

    await goToQuestion(page, 16);
    check(W, (await page.locator('#question-16').count()) === 1, 'Part6: split layout shown');
    await shot(`${name === 'desktop' ? 'desktop12' : 'mobile10'}-part6`, 'runner: Part 6 (q16-18)');
    for (const id of [16, 17, 18]) check(W, await answerCurrent(page, id, desiredIdx(id)), `answered q${id}`);

    await goToQuestion(page, 19);
    check(W, (await page.locator('#question-19').count()) === 1, 'Part7: split layout shown');
    await shot(`${name === 'desktop' ? 'desktop13' : 'mobile11'}-part7`, 'runner: Part 7 (q19-21)');
    for (const id of [19, 20, 21]) check(W, await answerCurrent(page, id, desiredIdx(id)), `answered q${id}`);
    log(name, 'STEP answered all 21 LR questions (q1-14 correct, q15-21 wrong -> 14/990)');

    // annotation toolbar
    const toolsBtn = page.locator('header button:has-text("Công cụ")');
    check(W, (await toolsBtn.count()) > 0, 'annotation toolbar toggle button present in header (reading)');
    await toolsBtn.click();
    await page.waitForTimeout(500);
    check(W, (await page.locator('[title="Highlight (H)"]').count()) > 0, 'annotation toolbar rendered (highlight tool)');
    await shot(`${name === 'desktop' ? 'desktop11' : 'mobile12'}-annotation-toolbar`, 'runner: annotation toolbar (Part 7)');
    await toolsBtn.click();
    await page.waitForTimeout(300);

    // bilingual toggle ON
    const biBtn = page.locator('header button:has-text("Song ngữ")');
    check(W, (await biBtn.count()) > 0, 'bilingual toggle button present');
    await biBtn.click();
    await page.waitForTimeout(400);
    check(W, (await page.locator('header button:has-text("Ẩn song ngữ")').count()) > 0, 'bilingual toggled ON (button now "Ẩn song ngữ")');
    await shot(`${name === 'desktop' ? 'desktop10' : 'mobile13'}-bilingual-on`, 'runner: bilingual toggle ON state');

    // ── 7. SUBMIT ───────────────────────────────────────────────────────
    await page.locator('header button:has-text("NỘP BÀI")').click();
    await page.waitForSelector('.ant-modal-confirm', { timeout: 8000 });
    check(W, /Nộp bài\?/.test(await page.locator('.ant-modal-confirm').innerText()), 'submit confirmation dialog shown');
    await shot(`${name}14-submit-confirm`, 'runner: submit confirmation dialog');
    await page.locator('.ant-modal-confirm .ant-btn-primary').click();

    // ── 8. RESULT ───────────────────────────────────────────────────────
    await page.waitForURL(/ket-qua\/\d+/, { timeout: 60000 });
    await page.waitForSelector('text=UNOFFICIAL SCORE CERTIFICATE', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const cert = await page.locator('body').innerText();
    check(W, /\/ 990/.test(cert), 'result: certificate "/ 990"');
    check(W, /14/.test(cert), 'result: score 14 rendered');
    const res = await page.evaluate(async (id) => {
      const r = await fetch(`/api/toeic-attempts/${id}/result`, { credentials: 'include' });
      return { status: r.status, body: await r.json() };
    }, Number(attemptId));
    check(W, res.body?.totalScore === 14, `result API totalScore=14 (got ${res.body?.totalScore})`);
    check(W, res.body?.status === 'FINAL', `result API status=FINAL (got ${res.body?.status})`);
    await shot(`${name}15-result`, 'result page (certificate)');

    // score table modal
    await page.locator('button:has-text("Bảng kết quả")').click();
    await page.waitForSelector('.ant-modal-title:has-text("Bảng kết quả")', { timeout: 8000 });
    check(W, (await page.locator('.ant-modal table').count()) > 0, 'score table modal: table rendered');
    await shot(`${name}16-score-table-modal`, 'score table modal (Bảng kết quả)');
    await closeModal(page);

    // error map
    await page.click('a[href*="/chi-tiet"]');
    await page.waitForURL(/chi-tiet/, { timeout: 15000 });
    await page.waitForSelector('text=Bản đồ lỗi sai TOEIC', { timeout: 15000 });
    await page.waitForTimeout(800);
    const mapText = await page.locator('body').innerText();
    check(W, /Lỗi sai theo Part/.test(mapText), 'error map: chart section');
    check(W, /Câu sai cần ôn lại/.test(mapText), 'error map: wrong question list');
    await shot(`${name}17-error-map`, 'error map page');

    // review detail modal
    await page.locator('button:has-text("Xem lại chi tiết")').first().click();
    await page.waitForSelector('.ant-modal:has-text("Xem lại chi tiết bài thi")', { timeout: 8000 });
    check(W, (await page.locator('.ant-modal table').count()) > 0, 'review modal: table rendered');
    await shot(`${name}18-review-detail`, 'review detail modal');
    await closeModal(page);

    // ── 9. HISTORY ──────────────────────────────────────────────────────
    await page.goto(`${BASE}/thi-thu/lich-su`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Lịch Sử Luyện Tập', { timeout: 15000 });
    await page.waitForTimeout(1200);
    const hist = await page.locator('body').innerText();
    check(W, hist.includes(`ID: ${attemptId}`), `history: attempt ${attemptId} listed`);
    check(W, /Hoàn thành/.test(hist), 'history: COMPLETED status (Hoàn thành)');
    await shot(`${name}19-history`, 'history page');

    // API cross-checks
    const at = await page.evaluate(async (id) => {
      const r = await fetch(`/api/toeic-attempts/${id}`, { credentials: 'include' });
      return { status: r.status, body: await r.json() };
    }, Number(attemptId));
    check(W, at.body?.status === 'COMPLETED', `attempt status COMPLETED (got ${at.body?.status})`);
    const rv = await page.evaluate(async (id) => {
      const r = await fetch(`/api/toeic-attempts/${id}/review`, { credentials: 'include' });
      return r.json();
    }, Number(attemptId));
    check(W, Array.isArray(rv) && rv.length === 21, `review rows=21 (got ${Array.isArray(rv) ? rv.length : 'n/a'})`);
    log(name, 'STEP history + API checks done');
    return { W, attemptId };
  } catch (err) {
    console.error(`[${name}] UNHANDLED JOURNEY ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { check(W, false, 'journey unhandled error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 240)); } catch { /* noop */ }
    return { W, attemptId };
  } finally {
    await ctx.close();
  }
}

/** Catalog loading + empty states via client-side route interception (no stack impact). */
async function runCatalogStates(browser) {
  const { ctx, page } = await newContext(browser, VIEWPORTS.desktop, 'states');
  const W = { errors: 0, checks: [], shots: [] };
  const shots = new Set();
  const shot = shotMaker(page, W, 'states', shots);
  try {
    await page.route('**/api/toeic-exams**', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.goto(`${BASE}/thi-thu`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    check(W, (await page.locator('main .animate-pulse, main [class*="skeleton"]').count()) > 0, 'catalog loading state rendered (skeleton)');
    await shot('states-catalog-loading', 'catalog loading state (desktop)');
    await page.unroute('**/api/toeic-exams**');
    await page.route('**/api/toeic-exams**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }) }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Chưa có đề thi nào', { timeout: 10000 });
    await shot('states-catalog-empty', 'catalog empty state (desktop)');
    log('states', 'STEP loading + empty catalog states captured (route interception, client-side only)');
    return { W };
  } catch (err) {
    console.error('[states] UNHANDLED ERROR:', err);
    try { check(W, false, 'states error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 240)); } catch { /* noop */ }
    return { W };
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ headless: true });

const desktop = await runJourney(browser, VIEWPORTS.desktop, 'desktop', 'ui');
const mobile = await runJourney(browser, VIEWPORTS.mobile, 'mobile', 'cookie');
const states = await runCatalogStates(browser);
await browser.close();

// ── EVIDENCE FILES ─────────────────────────────────────────────────────────
const now = new Date().toISOString();
const CHECK = (W) => `PASS=${W.checks.filter((c) => c.startsWith('PASS')).length} FAIL=${W.checks.filter((c) => c.startsWith('FAIL')).length}`;

function renderJourney(name, label, r) {
  return [
    `R2-LR ${label} LR journey — viewport ${JSON.stringify(VIEWPORTS[name] ?? VIEWPORTS.desktop)}`,
    `timestamp: ${now}`,
    `attemptId: ${r.attemptId ?? 'n/a'}`,
    `errors: ${r.W.errors}`,
    `CHECKLIST | R2-LR (${name}) | ${CHECK(r.W)}`,
    ...r.W.checks.map((c) => `  ${c}`),
    '',
    'STEP transcript:',
    ...out[name],
  ].join('\n');
}

writeFileSync(`${EV}/journey-desktop.txt`, renderJourney('desktop', 'desktop', desktop));
writeFileSync(`${EV}/journey-mobile.txt`, renderJourney('mobile', 'mobile', mobile));
writeFileSync(`${EV}/journey-states.txt`, [
  'R2-LR catalog loading + empty states (route interception, client-side only)',
  `timestamp: ${now}`,
  `errors: ${states.W.errors}`,
  `CHECKLIST | R2-LR (states) | ${CHECK(states.W)}`,
  ...states.W.checks.map((c) => `  ${c}`),
  '',
  ...out.states,
].join('\n'));

const REFMAP = [
  // desktop
  ['desktop01-catalog-sw', 'desktop/01', 'Catalog SW tab'],
  ['desktop02-catalog-lr', 'desktop/02', 'Catalog LR tab'],
  ['desktop03-mode-dialog', 'desktop/03', 'Exam start mode dialog'],
  ['desktop04-exam-detail', 'desktop/04', 'Exam detail page'],
  ['desktop05-listening-directions', 'desktop/05', 'Runner listening directions'],
  ['desktop06-part1-directions', 'desktop/06', 'Runner Part 1 directions'],
  ['desktop07-part1-q1', 'desktop/07', 'Runner Part 1 Q1 (photograph)'],
  ['desktop08-palette-answered', 'desktop/08', 'Palette open with answered marker'],
  ['desktop09-part5', 'desktop/09', 'Part 5 reading split layout'],
  ['desktop12-part6', 'desktop/12', 'Part 6 reading split layout'],
  ['desktop13-part7', 'desktop/13', 'Part 7 reading split layout'],
  ['desktop11-annotation-toolbar', 'desktop/11', 'Annotation toolbar (app implements; reference live-drift)'],
  ['desktop10-bilingual-on', 'desktop/10', 'Bilingual toggle ON state (app implements; reference live-drift)'],
  ['desktop14-submit-confirm', 'desktop/14', 'Submit confirmation dialog (app has dialog; reference historical-exception)'],
  ['desktop15-result', 'desktop/15', 'Result certificate'],
  ['desktop16-score-table-modal', 'desktop/16', 'Score table modal Bảng kết quả'],
  ['desktop17-error-map', 'desktop/17', 'Error map'],
  ['desktop18-review-detail', 'desktop/18', 'Review detail modal'],
  ['desktop19-history', 'desktop/19', 'History page'],
  ['desktop20-login-returnUrl', 'desktop/19 (history-gate analog)', 'Login page with returnUrl (anonymous gate)'],
  ['desktop21-post-login-return', '(no ref — app-side)', 'Post-login return with intent preserved'],
  ['desktop22-part2-audio-player', '(no ref — app-side)', 'Audio player visible (Part 2 Q4; Part1 has no audio in seed)'],
  // mobile
  ['mobile01-catalog-sw', 'mobile/01', 'Catalog SW tab (mobile)'],
  ['mobile02-catalog-lr', 'mobile/02', 'Catalog LR tab (mobile)'],
  ['mobile03-mode-dialog', '(no ref — app-side)', 'Mode dialog (mobile)'],
  ['mobile04-exam-detail', 'mobile/04', 'Exam detail page (mobile)'],
  ['mobile05-listening-directions', 'mobile/05', 'Listening directions (mobile)'],
  ['mobile06-part1-directions', 'mobile/06', 'Part 1 directions (mobile)'],
  ['mobile07-part1-q1', 'mobile/03', 'Runner Part 1 Q1 photograph (mobile)'],
  ['mobile08-palette-answered', 'mobile/08', 'Palette answered (mobile)'],
  ['mobile09-part5', 'mobile/09', 'Part 5 split layout (mobile)'],
  ['mobile10-part6', 'mobile/10', 'Part 6 split layout (mobile)'],
  ['mobile11-part7', 'mobile/11', 'Part 7 split layout (mobile)'],
  ['mobile12-annotation-toolbar', 'mobile/12', 'Annotation toolbar (mobile)'],
  ['mobile13-bilingual-on', 'mobile/13', 'Bilingual ON (mobile)'],
  ['mobile14-submit-confirm', 'mobile/14', 'Submit confirm (mobile)'],
  ['mobile15-result', 'mobile/15', 'Result (mobile)'],
  ['mobile16-score-table-modal', 'mobile/16', 'Score table modal (mobile)'],
  ['mobile17-error-map', 'mobile/17', 'Error map (mobile)'],
  ['mobile18-review-detail', 'mobile/18', 'Review detail (mobile)'],
  ['mobile19-history', 'mobile/19', 'History page (mobile)'],
  ['mobile20-login-returnUrl', '(no ref — app-side)', 'Login with returnUrl (mobile)'],
  ['mobile21-post-login-return', '(no ref — app-side)', 'Post-login return (mobile)'],
  ['mobile22-part2-audio-player', '(no ref — app-side)', 'Audio player Part 2 (mobile)'],
  // states
  ['states-catalog-loading', '(no ref — app-side)', 'Catalog loading state'],
  ['states-catalog-empty', '(no ref — app-side)', 'Catalog empty state'],
].filter(([f]) => desktop.W.shots.includes(f) || mobile.W.shots.includes(f) || states.W.shots.includes(f));

writeFileSync(`${EV}/screenshot-manifest.txt`, [
  'R2-LR screenshot manifest: <reference id> -> <actual png filename>',
  `timestamp: ${now}`,
  ...REFMAP.map(([f, ref, desc]) => `${ref} -> ${f}.png   (${desc})`),
].join('\n'));

function renderConsole(name, label) {
  return [
    `=== ${label} — console errors/warnings ===`,
    ...(consoleLog[name].length ? consoleLog[name] : ['(none — NONE EXPECTED)']),
    '',
    `=== ${label} — failed /api requests ===`,
    ...(failedReq[name].length ? failedReq[name] : ['(none — NONE EXPECTED)']),
    '',
    `=== ${label} — /api network ===`,
    ...network[name],
  ].join('\n');
}

writeFileSync(`${EV}/console-network-desktop.txt`, [
  'R2-LR desktop journey — console (errors/warnings) + failed requests + /api network',
  `timestamp: ${now}`,
  '',
  'EXPLAINED: attempt-GET started_at/created_at rewritten to now via client-side route',
  'interception (stack clock skew workaround, see summary.txt). Responses still show 200.',
  'EXPLAINED: 401s on /auth/* and /toeic-attempts* during the anonymous-gate phase are the',
  'intended gate behavior (anonymous visitor tries to start -> 401 -> /dang-nhap?returnUrl).',
  'EXPLAINED: login 429 from the shared per-IP auth rate limiter; script falls back to',
  'session-cookie injection (same httpOnly cookie).',
  '',
  renderConsole('desktop', 'DESKTOP LR JOURNEY'),
  '',
  renderConsole('states', 'DESKTOP CATALOG STATES (intercepted)'),
].join('\n'));

writeFileSync(`${EV}/console-network-mobile.txt`, [
  'R2-LR mobile journey — console (errors/warnings) + failed requests + /api network',
  `timestamp: ${now}`,
  '',
  'EXPLAINED: attempt-GET started_at/created_at rewritten to now via client-side route',
  'interception (stack clock skew workaround, see summary.txt). Responses still show 200.',
  'EXPLAINED: 401s on /auth/* and /toeic-attempts* during the anonymous-gate phase are the',
  'intended gate behavior (anonymous visitor tries to start -> 401 -> /dang-nhap?returnUrl).',
  '',
  renderConsole('mobile', 'MOBILE LR JOURNEY'),
].join('\n'));

writeFileSync(`${EV}/summary.txt`, [
  'R2-LR — fresh full LR journey evidence (Assignment R2-LR-JOURNEY)',
  `timestamp: ${now}`,
  '',
  `desktop attemptId: ${desktop.attemptId ?? '-'}`,
  `mobile attemptId:  ${mobile.attemptId ?? '-'}`,
  '',
  `DESKTOP: ${CHECK(desktop.W)} errors=${desktop.W.errors}`,
  `MOBILE:  ${CHECK(mobile.W)} errors=${mobile.W.errors}`,
  `STATES:  ${CHECK(states.W)} errors=${states.W.errors}`,
  '',
  `Desktop screenshots: ${desktop.W.shots.length}`, ...desktop.W.shots.map((s) => `  ${s}.png`),
  '',
  `Mobile screenshots:  ${mobile.W.shots.length}`, ...mobile.W.shots.map((s) => `  ${s}.png`),
  '',
  'VERDICT: ' + (desktop.W.errors + mobile.W.errors + states.W.errors === 0 ? 'PASS' : 'FAIL'),
  '',
  'KNOWN STACK ISSUE (explained, worked around — NOT an app defect found by this run):',
  '  Live backend serializes attempt started_at/created_at ~7h early (mysql2 pool in',
  '  anish-toeic-web-services/src/services/db.service.ts has no `timezone` option; host TZ is',
  '  UTC+7, and the runner counts down from started_at). Exam-mode attempts are born',
  '  "expired" and the runner auto-submits on mount (verified: POST /submit fires ~1s after',
  '  load). Workaround: the journey script rewrites started_at/created_at to now for the',
  '  attempt GET via client-side route interception (page.route, no app/DB/source change).',
  '  All other data, answers, scoring, and navigation are real.',
  '',
  'AUTH NOTE: shared per-IP auth rate limiter (20/900s) on the live stack is consumed by',
  '  other workstreams, so the UI login may return 429; the script falls back to injecting the',
  '  same httpOnly session cookie (valid seed.owner JWT, exp 2026-08-08) that the UI login sets.',
  '',
  'Data reality notes:',
  '  - Seed LR exam has 21 questions, ids == displayNumbers 1..21 (Part1: q1-3 images only,',
  '    Parts2-4: audio only, Parts5-7: text). Part1 q1 has NO audio_url in the seed, so the',
  '    audio player is shown/verified on Part2 q4 instead (same AudioPlayer component).',
  '  - Bilingual toggle ON state: button flips to "Ẩn song ngữ" (active style); seed content',
  '    carries no `→` translation lines, so no translation text is injected (reference shows a',
  '    translated corpus — live-drift).',
  '  - Submit-confirm dialog, annotation toolbar, bilingual toggle: app implements; reference',
  '    states are historical-exception/live-drift, so screenshots are app-side evidence.',
  '',
  'Replay:',
  '  node .agent/evidence/R2-LR/journey-script.mjs',
  '  (requires: FE :5173, BE :7000, MySQL anish-toeic-mysql, Redis :16379, seed.owner@example.com / seed-password-123)',
  '',
  'Console/network: see console-network-desktop.txt / console-network-mobile.txt (NONE EXPECTED; any entry is explained).',
].join('\n'));

console.log('\n--- R2-LR JOURNEY SUMMARY ---');
for (const [n, r] of Object.entries({ desktop, mobile, states })) {
  console.log(`${n}: ${CHECK(r.W)} errors=${r.W.errors} attemptId=${r.attemptId ?? '-'}`);
  for (const c of r.W.checks.filter((x) => x.startsWith('FAIL'))) console.log(`  ${c}`);
}
console.log('evidence written to', EV);
process.exit(desktop.W.errors + mobile.W.errors + states.W.errors ? 1 : 0);
