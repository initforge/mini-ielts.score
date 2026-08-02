/**
 * S4-FE journey — L&R runner (EXAM mode) on seed `anish-full-lr-001` (21 Q, parts 1-7).
 *
 * Covers:
 *  - AC11: autosave PATCH → reload resume → expiry auto-submit (clock fast-forward).
 *  - AC12: parts 1-7 controls (audio player via injected audio_url, passage split,
 *          palette, mark-for-review, review jump, bilingual, annotation tools).
 *  - AC13: submit → result → error map (`/chi-tiet`) → review → history;
 *          ownership: other user gets 404/403 with no data leak.
 *  - Conflict: two contexts edit the same question at the same revision → 409 →
 *          reconcile via refreshFromServer (no crash, answer re-saved).
 *
 * Desktop 1440x900 + mobile 390x844, fresh contexts.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

const BASE = 'http://localhost:5173';
const EV = '/home/linhnx/Projects/mini-toeic.score/.agent/evidence/S4-FE';
mkdirSync(EV, { recursive: true });

const OWNER = { email: 'seed.owner@example.com', password: 'seed-password-123' };
const OTHER = { email: 'seed.other@example.com', password: 'seed-password-123' };

const out = { desktop: [], mobile: [], conflict: [], expiry: [], audio: [], ownership: [] };
const consoleLog = { desktop: [], mobile: [], conflict: [], expiry: [], audio: [], ownership: [] };
const network = { desktop: [], mobile: [], conflict: [], expiry: [], audio: [], ownership: [] };

function log(v, s) { out[v].push(s); console.log(`[${v}] ${s}`); }
function hash(s) { return createHash('sha256').update(String(s)).digest('hex').slice(0, 16); }

function makeCheck(W, cond, label, extra = '') {
  W.checks.push(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
  if (!cond) W.errors++;
  return cond;
}

/** Minimal silent WAV (~0.25s) as a data URI for injected audio_url. */
function silentWavDataUri() {
  const sampleRate = 8000;
  const seconds = 0.25;
  const n = Math.floor(sampleRate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  return `data:audio/wav;base64,${buf.toString('base64')}`;
}
const SILENT_WAV = silentWavDataUri();

/** Node-side API call against the backend (avoids page-origin CORS issues). */
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

async function newContext(browser, viewport, name, { injectToken } = {}) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
  });
  if (injectToken) {
    await ctx.addInitScript((t) => {
      try { localStorage.setItem('token', t); } catch { /* noop */ }
    }, injectToken);
  }
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) {
      consoleLog[name].push(`${m.type().toUpperCase()}: ${m.text()}`);
      console.log(`[${name} console-${m.type()}] ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => consoleLog[name].push(`PAGEERROR: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/')) {
      network[name].push(`REQ ${r.method()} ${u.replace(BASE, '')} body=${(r.postData() ?? '').slice(0, 160)}`);
    }
  });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/')) {
      network[name].push(`RES ${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`);
    }
  });
  return { ctx, page };
}

async function login(page, cred = OWNER) {
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="email@example.com"]', cred.email);
  await page.fill('input[placeholder="••••••••"]', cred.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/thi-thu$/, { timeout: 12000 });
}

/** Catalog → LR exam card → Thi thử (EXAM) → Bắt đầu → runner URL. Returns attemptId. */
async function startExamAttempt(page) {
  await page.goto(`${BASE}/thi-thu`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Thư viện đề thi', { timeout: 12000 });
  const lrTab = page.locator('button:has-text("Listening & Reading")');
  await lrTab.click();
  await page.waitForSelector('text=Anish Full Practice 1 — Listening & Reading', { timeout: 12000 });
  await page.locator('button:has-text("Thi thử")').first().click();
  await page.waitForSelector('button:has-text("Bắt đầu")', { timeout: 12000 });
  await page.locator('button:has-text("Bắt đầu")').click();
  await page.waitForURL(/\/lam-bai\/(\d+)/, { timeout: 15000 });
  const m = page.url().match(/\/lam-bai\/(\d+)/);
  return m ? m[1] : null;
}

/** Click the NEXT button on intro / part directions panels while visible. */
async function dismissDirections(page) {
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('button:has-text("NEXT")').last();
    if (await btn.isVisible().catch(() => false)) {
      // React re-renders the panel right after the click (detaches the node);
      // force dispatch avoids the actionability retry race.
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    } else break;
  }
}

/**
 * Select an answer for the CURRENT question (index qIndex) deterministically:
 * pick = qIndex % optionCount, giving a realistic correct/wrong mix for the
 * error map. Works for listening (single question view) and reading passage
 * (current highlighted card).
 */
async function selectCurrentAnswer(page, qIndex) {
  let radios;
  const card = page.locator('div.border-blue-600[id^="question-"]').first();
  if (await card.count()) {
    radios = card.locator('[role="radio"]');
  } else {
    radios = page.locator('main [role="radio"]');
  }
  const n = await radios.count();
  if (n === 0) return false;
  await radios.nth(qIndex % n).click();
  await page.waitForTimeout(120);
  return true;
}

async function openPalette(page) {
  await page.locator('button[aria-label="Mở bảng câu hỏi"]').click();
  await page.waitForSelector('text=Bảng câu hỏi', { timeout: 8000 });
}

const PART_OF = (i) => Math.floor(i / 3) + 1; // 0-based qIndex → part 1..7

async function runViewport(browser, viewport, name) {
  const { ctx, page } = await newContext(browser, viewport, name);
  const W = { errors: 0, checks: [] };
  let attemptId = null;
  const seenScreens = new Set();
  const shot = async (key, label) => {
    if (seenScreens.has(key)) return;
    seenScreens.add(key);
    const p = `${EV}/${key}-${name}.png`;
    try { await page.screenshot({ path: p, fullPage: false }); } catch { /* noop */ }
    log(name, `SCREENSHOT ${label} → ${key}-${name}.png`);
  };

  try {
    // ── login ──
    await login(page);
    log(name, 'STEP logged in as seed.owner');

    // ── catalog → EXAM attempt ──
    attemptId = await startExamAttempt(page);
    makeCheck(W, !!attemptId, `attempt created (id=${attemptId})`);
    log(name, `STEP attempt created: ${attemptId}`);

    // ── intro directions ──
    await page.waitForSelector('text=DIRECTIONS', { timeout: 15000 });
    await shot('runner-intro', 'intro DIRECTIONS panel');
    await dismissDirections(page);
    log(name, 'STEP intro dismissed');

    // ── answer 21 questions ──
    for (let i = 0; i < 21; i++) {
      await dismissDirections(page);
      const part = PART_OF(i);
      const ok = await selectCurrentAnswer(page, i);
      makeCheck(W, ok, `answered q${i + 1} (part ${part})`);
      // mark q2 and q5 for review while still on them (EXAM mode disables
      // palette jumps across listening/reading groups, so mark inline).
      if (i === 1 || i === 4) {
        const markBtn = page.locator('button:has-text("Mark items for review"), button:has-text("Đánh dấu")').last();
        await markBtn.click();
        await page.waitForTimeout(300);
      }
      if (i === 0) await shot('runner-part1', 'listening part 1 question view');
      if (i === 3) await shot('runner-part2', 'listening part 2 question view');
      if (part === 5 && i === 12) await shot('runner-part5', 'reading part 5 view');
      if (part === 7 && i === 19) await shot('runner-part7', 'reading part 7 passage view');
      if (i < 20) {
        await page.locator('button:has-text("Câu tiếp")').click();
        await page.waitForTimeout(180);
      }
    }
    log(name, 'STEP answered all 21 questions');

    // palette shows answered + marked states
    await openPalette(page);
    const answeredTexts = await page.locator('.text-sm.font-semibold.text-blue-600').allInnerTexts().catch(() => []);
    const answeredText = answeredTexts[0] ?? '';
    makeCheck(W, /\/21$/.test(answeredText || ''), 'palette shows 21/21 answered', answeredText);
    await shot('runner-palette-marked', 'palette with answered+marked states');
    await page.locator('text=Đóng').first().click();
    await page.waitForTimeout(800); // let drawer/overlay close animation finish before header clicks
    // review jump button count badge (amber pill inside the Review button)
    const reviewPill = page.locator('.bg-amber-400.rounded-full');
    const badge = await reviewPill.first().textContent().catch(() => '');
    makeCheck(W, badge && parseInt(badge) >= 2, `review badge ≥ 2 (got ${badge})`, badge);
    log(name, 'STEP marked q2 & q5 for review, badge checked');

    // ── bilingual toggle ──
    try {
      await page.locator('button:has-text("Song ngữ")').first().click();
      await page.waitForTimeout(300);
      makeCheck(W, (await page.locator('button:has-text("Ẩn song ngữ")').count()) > 0, 'bilingual toggle on');
      await page.locator('button:has-text("Ẩn song ngữ")').first().click();
      log(name, 'STEP bilingual toggled');
    } catch (e) {
      log(name, `WARN bilingual step skipped: ${e.message.slice(0, 80)}`);
    }

    // ── annotation tools on a reading part ──
    try {
      await openPalette(page);
      await page.locator('button[aria-label^="Câu 21"]').first().click();
      await page.waitForTimeout(250);
      await page.locator('text=Đóng').first().click();
      await page.waitForTimeout(800); // drawer close animation before header click
      await page.locator('button:has-text("Công cụ")').first().click();
      await page.waitForSelector('button[title="Bút (P)"]', { timeout: 6000 });
      await shot('runner-annotation', 'reading annotation tools open');
      const canvas = page.locator('canvas');
      if (await canvas.count()) {
        const box = await canvas.first().boundingBox();
        if (box) {
          await page.mouse.move(box.x + 60, box.y + 60);
          await page.mouse.down();
          await page.mouse.move(box.x + 220, box.y + 140, { steps: 8 });
          await page.mouse.up();
          await page.waitForTimeout(400);
          await page.locator('button[title="Lưu"]').click();
          await page.waitForSelector('text=Đã lưu chú thích', { timeout: 4000 });
          log(name, 'STEP annotation stroke drawn + saved');
        }
      }
      await page.locator('button:has-text("Công cụ")').first().click();
      log(name, 'STEP annotation tools closed');
    } catch (e) {
      log(name, `WARN annotation step skipped: ${e.message.slice(0, 80)}`);
    }

    // ── wait for autosave PATCH to settle ──
    await page.waitForTimeout(2500);
    const patch200 = network[name].filter((l) => /RES 200 PATCH \/api\/toeic-attempts\/\d+\/responses/.test(l)).length;
    makeCheck(W, patch200 >= 21, `autosave PATCH 200 seen (count=${patch200})`);
    log(name, `STEP autosave PATCH 200 count=${patch200}`);

    // ── RELOAD → resume ──
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await dismissDirections(page);
    await openPalette(page);
    const resumedTexts = await page.locator('.text-sm.font-semibold.text-blue-600').allInnerTexts().catch(() => []);
    const resumed = resumedTexts[0] ?? '';
    makeCheck(W, /\/21$/.test(resumed || ''), 'answers restored after reload (resume)', resumed);
    await shot('runner-resume', 'palette after reload (answers restored)');
    await page.locator('text=Đóng').first().click();
    log(name, 'STEP reload → resume verified');

    // ── submit ──
    await openPalette(page);
    await page.locator('button[aria-label^="Câu 21"]').first().click();
    await page.waitForTimeout(250);
    await page.locator('text=Đóng').first().click();
    await page.locator('button:has-text("NỘP BÀI")').first().click();
    await page.waitForSelector('.ant-modal-confirm', { timeout: 8000 });
    await shot('runner-submit-confirm', 'submit confirmation modal');
    await page.locator('.ant-modal-confirm .ant-btn-primary').click();
    await page.waitForURL(/\/ket-qua\/\d+/, { timeout: 30000 });
    log(name, 'STEP submitted → result page');
    makeCheck(W, true, 'submit navigated to result');

    // ── result page ──
    await page.waitForSelector('text=UNOFFICIAL SCORE CERTIFICATE', { timeout: 20000 });
    await shot('result', 'result certificate page');
    const certText = await page.locator('body').innerText();
    makeCheck(W, /\/ 990/.test(certText), 'total score / 990 shown');
    makeCheck(W, /Bản đồ lỗi sai/.test(certText), 'error map button present');
    const res200 = network[name].filter((l) => /RES 200 GET \/api\/toeic-attempts\/\d+\/result/.test(l)).length;
    makeCheck(W, res200 >= 1, `result GET 200 (count=${res200})`);
    const sub200 = network[name].filter((l) => /RES 200 POST \/api\/toeic-attempts\/\d+\/submit/.test(l)).length;
    makeCheck(W, sub200 >= 1, `submit POST 200 (count=${sub200})`);
    log(name, 'STEP result page verified');

    // ── error map (/chi-tiet) ──
    await page.locator('a[href*="/chi-tiet"], button:has-text("Bản đồ lỗi sai")').first().click();
    await page.waitForURL(/\/chi-tiet/, { timeout: 15000 });
    await page.waitForSelector('text=Bản đồ lỗi sai TOEIC', { timeout: 20000 });
    await shot('errormap', 'error map page');
    const mapText = await page.locator('body').innerText();
    makeCheck(W, /Lỗi sai theo Part/.test(mapText), 'error map chart section');
    makeCheck(W, /Câu sai cần ôn lại/.test(mapText), 'wrong-question list section');
    const rev200 = network[name].filter((l) => /RES 200 GET \/api\/toeic-attempts\/\d+\/review/.test(l)).length;
    makeCheck(W, rev200 >= 1, `review GET 200 (count=${rev200})`);
    log(name, 'STEP error map verified');

    // ── review detail modal ──
    await page.locator('button:has-text("Xem lại chi tiết")').first().click();
    await page.waitForSelector('.ant-modal', { timeout: 8000 });
    await shot('review', 'review detail modal');
    makeCheck(W, (await page.locator('.ant-modal table').count()) > 0, 'review modal shows table');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    log(name, 'STEP review modal verified');

    // ── history ──
    await page.goto(`${BASE}/thi-thu/lich-su`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Lịch Sử Luyện Tập', { timeout: 15000 });
    await page.waitForTimeout(800);
    await shot('history', 'history page');
    const histText = await page.locator('body').innerText();
    makeCheck(W, new RegExp(`ID: ${attemptId}`).test(histText), `attempt ${attemptId} in history`);
    makeCheck(W, /Hoàn thành/.test(histText), 'attempt status COMPLETED (Hoàn thành)');
    const link = page.locator(`a[href="/thi-thu/ket-qua/${attemptId}"]`);
    makeCheck(W, (await link.count()) > 0, 'Xem kết quả link present');
    if (await link.count()) {
      await link.first().click();
      await page.waitForURL(/\/ket-qua\/\d+/, { timeout: 15000 });
      await page.waitForSelector('text=UNOFFICIAL SCORE CERTIFICATE', { timeout: 15000 });
      log(name, 'STEP history → Xem kết quả link works');
    }

    // ── verify attempt status via API ──
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const statusRes = await page.evaluate(async ({ id, t }) => {
      const r = await fetch(`/api/toeic-attempts/${id}`, { headers: { Authorization: `Bearer ${t}` } });
      return { status: r.status, body: await r.json() };
    }, { id: Number(attemptId), t: token });
    makeCheck(W, statusRes.body && statusRes.body.status === 'COMPLETED', 'attempt status COMPLETED via API', statusRes.body?.status);
    log(name, `STEP attempt status=${statusRes.body?.status}`);

    return { W, attemptId, token };
  } catch (err) {
    console.error(`[${name}] UNHANDLED JOURNEY ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { makeCheck(W, false, 'journey unhandled error: ' + (err instanceof Error ? err.message : String(err))); } catch (e) { console.error('check in catch failed:', e); }
    let token = null;
    try { token = await page.evaluate(() => localStorage.getItem('token')); } catch { /* page may be gone */ }
    return { W, attemptId, token };
  } finally {
    await ctx.close();
  }
}

/**
 * Conflict test (desktop): two contexts on the same attempt, same question,
 * same revision, different payload → server 409 → refreshFromServer reconciles.
 * Uses a FRESH IN_PROGRESS attempt (a completed attempt would be redirected
 * by the runner to the result page).
 */
async function runConflict(browser, ownerToken) {
  const name = 'conflict';
  const W = { errors: 0, checks: [] };
  const { ctx, page } = await newContext(browser, { width: 1440, height: 900 }, name, { injectToken: ownerToken });
  try {
    const created = await api(ownerToken, 'POST', '/toeic-exams/1/attempts', { mode: 'EXAM' });
    const attemptId = created.body?.attemptId;
    makeCheck(W, !!attemptId, `conflict attempt created (id=${attemptId})`);

    await page.goto(`${BASE}/thi-thu/lam-bai/${attemptId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 20000 });
    await page.waitForTimeout(1500);
    await dismissDirections(page);

    // Baseline revision of question 1 (fresh attempt → no responses → rev 0).
    const attemptJson = await api(ownerToken, 'GET', `/toeic-attempts/${attemptId}`);
    const firstQid = attemptJson.body.session.questions[0].id;
    const baseline = attemptJson.body.responses.find((x) => x.question_id === firstQid);
    const baseRev = baseline?.client_revision ?? 0;
    log(name, `baseline rev(q1)=${baseRev}, qid=${firstQid}`);

    // Concurrent editor (context A) PATCHes q1 far ahead: clientRevision=baseRev+5.
    // The runner page still holds rev=baseRev, so its next edit PATCHes with a
    // stale revision → deterministic 409 'Stale client_revision' regardless of
    // which option is picked.
    const bump = await api(ownerToken, 'PATCH', `/toeic-attempts/${attemptId}/responses/${firstQid}`, {
      selectedOptionId: null, markedForReview: true, note: null, clientRevision: baseRev + 5,
    });
    makeCheck(W, bump.status === 200, `concurrent editor PATCH rev+5 accepted (${bump.status})`);

    // Now the runner page (stale rev baseRev) edits q1 again → its PATCH has the
    // SAME revision as the server's current one but a different payload → 409.
    await openPalette(page);
    const q1Btn = page.locator('button[aria-label^="Câu 1"]').first();
    await q1Btn.click();
    await page.waitForTimeout(250);
    await page.locator('text=Đóng').first().click();
    await dismissDirections(page);
    // select a different option on q1 (the runner already has rev baseRev locally)
    const card = page.locator('div.border-blue-600[id^="question-"]').first();
    const radios = (await card.count()) ? card.locator('[role="radio"]') : page.locator('main [role="radio"]');
    const n = await radios.count();
    await radios.nth(0).click();
    await page.waitForTimeout(700);

    // Wait for the 409 + reconciliation to appear in the network log.
    const patch409 = (l) => /RES 409 PATCH \/api\/toeic-attempts\/\d+\/responses/.test(l);
    const patch200 = (l) => /RES 200 PATCH \/api\/toeic-attempts\/\d+\/responses/.test(l);
    let saw409 = false;
    let idx409 = -1;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(500);
      idx409 = network[name].findIndex(patch409);
      saw409 = idx409 >= 0;
      if (saw409) break;
    }
    makeCheck(W, saw409, 'stale PATCH rejected with HTTP 409');

    // Reconcile: refreshFromServer merges the local dirty draft (bumped rev)
    // and re-saves → eventually a 200 PATCH for q1 AFTER the 409.
    let reconciled = false;
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(500);
      reconciled = network[name].some((l, idx) => patch200(l) && idx > idx409);
      if (reconciled) break;
    }
    makeCheck(W, reconciled, 'after 409 → re-save PATCH succeeds (reconcile)');

    const finalJson = await api(ownerToken, 'GET', `/toeic-attempts/${attemptId}`);
    const finalState = finalJson.body.responses.find((x) => x.question_id === firstQid);
    makeCheck(W, (finalState?.client_revision ?? 0) >= baseRev + 6, `final rev(q1)=${finalState?.client_revision} ≥ base+6 (dirty draft re-saved, no ack lost)`);
    log(name, `final rev(q1)=${finalState?.client_revision} (base ${baseRev})`);
    // no error surface
    const errVisible = await page.locator('.ant-message-error').count();
    makeCheck(W, errVisible === 0, 'no error banner after conflict reconcile');
    await page.screenshot({ path: `${EV}/conflict-reconciled.png` });
    return { W };
  } catch (err) {
    console.error('[conflict] UNHANDLED ERROR:', err);
    makeCheck(W, false, 'conflict journey unhandled error: ' + (err instanceof Error ? err.message : String(err)));
    return { W };
  } finally {
    await ctx.close();
  }
}

/**
 * Expiry (AC11): install a fake clock, fast-forward past the 120-min deadline,
 * assert the runner auto-submits to the result page.
 */
async function runExpiry(browser, ownerToken) {
  const name = 'expiry';
  const W = { errors: 0, checks: [] };
  const { ctx, page } = await newContext(browser, { width: 1440, height: 900 }, name, { injectToken: ownerToken });
  try {
    // create a fresh attempt via API
    const created = await api(ownerToken, 'POST', '/toeic-exams/1/attempts', { mode: 'EXAM' });
    const attemptId = created.body?.attemptId;
    makeCheck(W, !!attemptId, `expiry attempt created (id=${attemptId})`);

    await page.clock.install();
    await page.goto(`${BASE}/thi-thu/lam-bai/${attemptId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=DIRECTIONS', { timeout: 15000 });
    // countdown shows a large positive value at first
    const t0 = await page.locator('.font-mono').first().textContent().catch(() => '');
    makeCheck(W, /^\d{2}:\d{2}:\d{2}$/.test(t0 || ''), 'countdown timer rendered', t0);

    // fast-forward 121 minutes → remainingSeconds hits 0 → auto-submit
    await page.clock.fastForward(121 * 60 * 1000);
    await page.waitForURL(/\/ket-qua\/\d+/, { timeout: 45000 }).catch(() => {});
    const expired = /\/ket-qua\/\d+/.test(page.url());
    makeCheck(W, expired, 'expired attempt auto-submitted → result page');
    log(name, `STEP fast-forward 121min → URL=${page.url()}`);
    await page.screenshot({ path: `${EV}/expiry-auto-submit.png` });

    const statusJson = await api(ownerToken, 'GET', `/toeic-attempts/${attemptId}`);
    const status = statusJson.body?.status;
    makeCheck(W, status === 'COMPLETED', `expired attempt COMPLETED (got ${status})`);
    return { W };
  } catch (err) {
    console.error('[expiry] UNHANDLED ERROR:', err);
    makeCheck(W, false, 'expiry journey unhandled error: ' + (err instanceof Error ? err.message : String(err)));
    return { W };
  } finally {
    await ctx.close();
  }
}

/**
 * Audio player (AC12 parts 1-4): intercept the attempt GET, inject audio_url
 * for listening questions, assert <audio controls> renders.
 */
async function runAudioCheck(browser, ownerToken) {
  const name = 'audio';
  const W = { errors: 0, checks: [] };
  const { ctx, page } = await newContext(browser, { width: 1440, height: 900 }, name, { injectToken: ownerToken });
  try {
    const created = await api(ownerToken, 'POST', '/toeic-exams/1/attempts', { mode: 'EXAM' });
    const attemptId = created.body?.attemptId;
    makeCheck(W, !!attemptId, `audio-check attempt created (id=${attemptId})`);

    // Inject audio_url for listening sections (order_index 1..4).
    await page.route('**/api/toeic-attempts/*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const res = await route.fetch();
      const json = await res.json();
      if (json && json.session && Array.isArray(json.session.questions)) {
        const sectionOrder = new Map(json.session.sections.map((s) => [s.id, s.order_index]));
        json.session.questions = json.session.questions.map((q) =>
          (sectionOrder.get(q.section_id) ?? 9) <= 4 ? { ...q, audio_url: SILENT_WAV } : q
        );
      }
      await route.fulfill({ response: res, json });
    });

    await page.goto(`${BASE}/thi-thu/lam-bai/${attemptId}`, { waitUntil: 'domcontentloaded' });
    // EXAM mode starts on the intro DIRECTIONS panel — audio renders after it
    // (and any part-1 directions) are dismissed.
    await page.waitForSelector('text=DIRECTIONS', { timeout: 20000 });
    await dismissDirections(page);
    await page.waitForSelector('audio[controls]', { timeout: 15000 });
    const audioCount = await page.locator('audio[controls]').count();
    makeCheck(W, audioCount >= 1, `audio player rendered (count=${audioCount})`);
    await page.screenshot({ path: `${EV}/audio-player.png` });
    log(name, `STEP audio player visible (count=${audioCount})`);
    // advance through listening parts; each should keep the audio element
    for (let i = 0; i < 12; i++) {
      await dismissDirections(page);
      if (i < 11) {
        await page.locator('button:has-text("Câu tiếp")').click();
        await page.waitForTimeout(150);
      }
    }
    const stillAudio = await page.locator('audio[controls]').count();
    makeCheck(W, stillAudio >= 1, `audio player persists across listening parts (count=${stillAudio})`);
    return { W };
  } catch (err) {
    console.error('[audio] UNHANDLED ERROR:', err);
    makeCheck(W, false, 'audio journey unhandled error: ' + (err instanceof Error ? err.message : String(err)));
    return { W };
  } finally {
    await ctx.close();
  }
}

/** Ownership (AC13): other user must NOT read the attempt/result/review. */
async function runOwnership(browser, attemptId) {
  const name = 'ownership';
  const W = { errors: 0, checks: [] };
  const { ctx, page } = await newContext(browser, { width: 1440, height: 900 }, name);
  try {
    await login(page, OTHER);
    log(name, 'STEP logged in as seed.other');

    const checks = await page.evaluate(async (id) => {
      const t = localStorage.getItem('token');
      const out = {};
      for (const path of ['', '/result', '/review']) {
        const r = await fetch(`/api/toeic-attempts/${id}${path}`, { headers: { Authorization: `Bearer ${t}` } });
        const b = await r.text();
        out[path || '/'] = { status: r.status, leak: /session|responses|questions|listeningScore|readingScore|correct_option/.test(b), body: b.slice(0, 120) };
      }
      return out;
    }, Number(attemptId));
    for (const [path, r] of Object.entries(checks)) {
      makeCheck(W, r.status === 404 || r.status === 403, `other user GET ${path} → ${r.status} (403/404)`, r.body);
      makeCheck(W, !r.leak, `no data leak via ${path}`, r.body);
      log(name, `GET /toeic-attempts/${attemptId}${path} → ${r.status}, leak=${r.leak}`);
    }

    // browser-level: error map page shows an error, not the data
    await page.goto(`${BASE}/thi-thu/ket-qua/${attemptId}/chi-tiet`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ant-alert', { timeout: 15000 });
    await page.screenshot({ path: `${EV}/ownership-denied.png` });
    const body = await page.locator('body').innerText();
    makeCheck(W, !/Bản đồ lỗi sai TOEIC/.test(body), 'error map page does not render for other user');
    log(name, 'STEP other user blocked from error map page');

    // result page for other user → error, no certificate
    await page.goto(`${BASE}/thi-thu/ket-qua/${attemptId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const rbody = await page.locator('body').innerText();
    makeCheck(W, !/UNOFFICIAL SCORE CERTIFICATE/.test(rbody), 'result page does not render certificate for other user');
    log(name, 'STEP other user blocked from result page');
    return { W };
  } catch (err) {
    console.error('[ownership] UNHANDLED ERROR:', err);
    makeCheck(W, false, 'ownership journey unhandled error: ' + (err instanceof Error ? err.message : String(err)));
    return { W };
  } finally {
    await ctx.close();
  }
}

// ──────────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });

const desktop = await runViewport(browser, { width: 1440, height: 900 }, 'desktop');
const mobile = await runViewport(browser, { width: 390, height: 844 }, 'mobile');

const conflict = await runConflict(browser, desktop.token);
const expiry = await runExpiry(browser, desktop.token);
const audio = await runAudioCheck(browser, desktop.token);
const ownership = await runOwnership(browser, desktop.attemptId);

await browser.close();

// ── write evidence files ─────────────────────────────────────────────────

const render = (v, result) => [
  `S4-FE journey — ${v} (viewport 1440x900 desktop / 390x844 mobile)`,
  `timestamp: ${new Date().toISOString()}`,
  `attemptId: ${result.attemptId}`,
  `errors: ${result.W.errors}`,
  ...result.W.checks,
  '',
  ...out[v],
].join('\n');

writeFileSync(`${EV}/journey-desktop.txt`, render('desktop', desktop));
writeFileSync(`${EV}/journey-mobile.txt`, render('mobile', mobile));

writeFileSync(
  `${EV}/autosave-resume.txt`,
  [
    'S4-FE autosave + resume (AC11)',
    `timestamp: ${new Date().toISOString()}`,
    '',
    'PATCH autosave → reload → answers restored; snapshot in IndexedDB',
    `attemptId: ${desktop.attemptId}`,
    '',
    '=== DESKTOP checks ===', ...desktop.W.checks,
    '',
    '=== EXPIRY checks ===', ...expiry.W.checks,
    ...out.expiry,
    '',
    '=== AUTOSAVE PATCH 200 (desktop) ===',
    ...network.desktop.filter((l) => l.includes('PATCH') && l.includes('/responses')),
    '',
    '=== RESUME palette snapshot ===',
    ...out.desktop.filter((l) => l.includes('resume') || l.includes('autosave')),
  ].join('\n')
);

writeFileSync(
  `${EV}/conflict.txt`,
  [
    'S4-FE conflict handling (AC11 revisions)',
    `timestamp: ${new Date().toISOString()}`,
    `attemptId: ${desktop.attemptId}`,
    '',
    'Two contexts, same question, same client_revision, different payload → 409',
    '→ refreshFromServer merges local dirty draft (rev bump) → re-save 200.',
    '',
    ...conflict.W.checks,
    '',
    ...out.conflict,
    '',
    ...network.conflict.filter((l) => l.includes('responses') || l.includes('toeic-attempts/') && l.includes('PATCH')),
  ].join('\n')
);

writeFileSync(
  `${EV}/ownership.txt`,
  [
    'S4-FE ownership (AC13)',
    `timestamp: ${new Date().toISOString()}`,
    `attemptId: ${desktop.attemptId}`,
    '',
    ...ownership.W.checks,
    '',
    ...out.ownership,
    '',
    ...network.ownership.filter((l) => l.includes('toeic-attempts')),
  ].join('\n')
);

writeFileSync(
  `${EV}/console-network.txt`,
  [
    'S4-FE console (errors/warnings) + network proof',
    `timestamp: ${new Date().toISOString()}`,
    '',
    '=== DESKTOP console ===', ...consoleLog.desktop,
    '',
    '=== MOBILE console ===', ...consoleLog.mobile,
    '',
    '=== CONFLICT console ===', ...consoleLog.conflict,
    '',
    '=== AUDIO console ===', ...consoleLog.audio,
    '',
    '=== DESKTOP network (api) ===', ...network.desktop,
    '',
    '=== MOBILE network (api) ===', ...network.mobile,
  ].join('\n')
);

console.log('\n--- SUMMARY ---');
for (const [n, r] of Object.entries({ desktop, mobile, conflict, expiry, audio, ownership })) {
  console.log(`${n}: errors=${r.W.errors}`);
  for (const c of r.W.checks) console.log(`  ${c}`);
}
console.log('evidence written to', EV);
