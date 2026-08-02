/**
 * S5-FE journey — real SW runner (swStore + SpeakingView + MicrophoneSetup +
 * Quill WritingView) wired into SWRunnerPage.
 *
 * Runs desktop + mobile. Grants mic permission + fake device stream so
 * MediaRecorder produces a real blob; the presigned PUT target is the backend
 * test adapter (mock URL) so the S3 PUT fails by design — retry path covered.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

const BASE = 'http://localhost:5173';
const EV = '/home/linhnx/Projects/mini-toeic.score/.agent/evidence/S5-FE';
mkdirSync(EV, { recursive: true });

const LOGIN = { email: 'seed.owner@example.com', password: 'seed-password-123' };

const out = { desktop: [], mobile: [] };
const consoleLog = { desktop: [], mobile: [] };
const network = { desktop: [], mobile: [] };
const uploads = { desktop: [], mobile: [] };

function log(v, s) { out[v].push(s); console.log(`[${v}] ${s}`); }
function check(W, cond, label, extra = '') {
  W.checks.push(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
  if (!cond) W.errors++;
}
function hash(s) { return createHash('sha256').update(s).digest('hex').slice(0, 16); }

async function newContext(browser, viewport, name) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    permissions: ['microphone'],
  });
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
      network[name].push(`REQ ${r.method()} ${u} body=${(r.postData() ?? '').slice(0, 200)}`);
    }
    if (u.includes('test-bucket.s3.test')) {
      uploads[name].push(`REQ-PUT ${r.method()} ${u.slice(0, 120)}`);
    }
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.includes('test-bucket.s3.test')) {
      uploads[name].push(`PUT-FAILED ${u.slice(0, 120)} :: ${r.failure()?.errorText}`);
      log(name, `UPLOAD PUT failed (mock adapter, S3 unavailable): ${r.failure()?.errorText}`);
    }
  });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/')) network[name].push(`RES ${r.status()} ${r.request().method()} ${u}`);
    if (u.includes('test-bucket.s3.test')) uploads[name].push(`RES-PUT ${r.status()} ${u.slice(0, 120)}`);
  });
  return { ctx, page };
}

async function login(page) {
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="email@example.com"]', LOGIN.email);
  await page.fill('input[placeholder="••••••••"]', LOGIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/thi-thu/, { timeout: 10000 });
}

async function startSWAttempt(page) {
  await page.goto(`${BASE}/thi-thu`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Thư viện đề thi', { timeout: 10000 });
  const swTab = page.locator('button:has-text("Speaking & Writing")');
  await swTab.click();
  await page.waitForSelector('text=Anish Full Practice 1 — Speaking & Writing', { timeout: 10000 });
  await page.locator('button:has-text("Thi thử")').first().click();
  await page.waitForSelector('button:has-text("Bắt đầu")', { timeout: 10000 });
  await page.locator('button:has-text("Bắt đầu")').click();
  await page.waitForURL(/lam-bai-sw/, { timeout: 10000 });
  const m = page.url().match(/lam-bai-sw\/(\d+)/);
  return m ? m[1] : null;
}

async function micSetup(page, name, step) {
  // Mic check page
  await page.waitForSelector('text=Microphone Setup', { timeout: 15000 });
  await page.screenshot({ path: `${EV}/mic-setup-${name}.png`, fullPage: true });
  log(name, 'STEP mic-check rendered');
  await page.locator('button:has-text("Allow Microphone Access")').click();
  // analyser test ~2.5s
  await page.waitForSelector('text=Continue to Test', { timeout: 15000 });
  await page.screenshot({ path: `${EV}/mic-ready-${name}.png`, fullPage: true });
  await page.locator('button:has-text("Continue to Test")').click();
  // directions
  await page.waitForSelector('text=DIRECTIONS', { timeout: 10000 });
  log(name, 'STEP directions rendered');
  await page.screenshot({ path: `${EV}/directions-${name}.png`, fullPage: true });
  await page.locator('button:has-text("BẮT ĐẦU")').click();
}

async function recordSpeaking(page, name, withPrep) {
  if (withPrep) {
    const startBtn = page.locator('button:has-text("Bắt đầu chuẩn bị")');
    try {
      await startBtn.waitFor({ timeout: 2000 });
      await startBtn.click();
    } catch { /* prep already auto-started after directions */ }
    await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
    await page.screenshot({ path: `${EV}/speaking-prep-${name}.png`, fullPage: true });
    log(name, 'STEP prep timer shown');
    await page.locator('button:has-text("Bỏ qua chuẩn bị")').click();
  }
  // record ~2.5s then stop
  await page.locator('button[aria-label="Start recording"]').click();
  await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 8000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${EV}/speaking-record-${name}.png`, fullPage: true });
  log(name, 'STEP recording active (timer running)');
  await page.locator('button[aria-label="Stop recording"]').click();
  // playback state
  await page.waitForSelector('button:has-text("Play Recording")', { timeout: 8000 });
  await page.screenshot({ path: `${EV}/speaking-playback-${name}.png`, fullPage: true });
  log(name, 'STEP recording saved, playback available');
  await page.locator('button:has-text("Play Recording")').click();
  await page.waitForTimeout(1200);
  await page.locator('button:has-text("Pause")').click();
  log(name, 'STEP playback played + paused');
}

async function typing(page, text) {
  await page.locator('.ql-editor').click();
  await page.keyboard.type(text, { delay: 20 });
}

async function runViewport(browser, viewport, name) {
  const { ctx, page } = await newContext(browser, viewport, name);
  const W = { errors: 0, checks: [] };
  let attemptId = null;

  try {
    // ── 1. login ──
    await login(page);
    log(name, 'STEP logged in');

    // ── 2. catalog → SW → attempt ──
    attemptId = await startSWAttempt(page);
    check(W, !!attemptId, `attempt created (id=${attemptId})`);
    log(name, `STEP SW attempt created: ${attemptId}`);

    // ── 3. mic setup + directions ──
    await micSetup(page, name, '');
    log(name, 'STEP mic granted + test passed');

    // ── 4. speaking q1 full flow (prep → record → stop → playback) ──
    await recordSpeaking(page, name, true);
    check(W, (await page.locator('text=Preparation Time').count()) === 0, 'prep finished');
    // upload attempt triggered by finishRecording → presign → mock PUT fails → retry UI
    const retryBtn = page.locator('button:has-text("Retry")');
    let uploadErrorShown = false;
    try {
      await retryBtn.waitFor({ timeout: 15000 });
      uploadErrorShown = true;
    } catch { /* may not fail if presign/PUT path raced */ }
    check(W, uploadErrorShown, 'upload error surfaced (mock S3) with Retry button');
    if (uploadErrorShown) {
      await page.screenshot({ path: `${EV}/speaking-upload-retry-${name}.png`, fullPage: true });
      await retryBtn.click();
      await page.waitForTimeout(2500);
      log(name, 'STEP upload retry clicked (2nd presign issued)');
      check(W, (await page.locator('button:has-text("Retry")').count()) > 0, 'retry failed again (expected, mock S3)');
      await page.screenshot({ path: `${EV}/speaking-upload-failed-${name}.png`, fullPage: true });
    }
    log(name, 'STEP speaking q1 recorded + upload retry handled');

    // ── 5. next question (q2 speaking) ──
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('button[aria-label="Start recording"]', { timeout: 8000 });
    await recordSpeaking(page, name, false);
    log(name, 'STEP speaking q2 recorded');

    // ── 6. q3 speaking — skip (no recording) then move to writing ──
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForTimeout(800);
    await page.locator('button:has-text("Câu tiếp")').click();
    // writing phase
    await page.waitForSelector('.ql-editor', { timeout: 10000 });
    check(W, true, 'writing phase reached (Quill editor visible)');
    log(name, 'STEP writing phase reached');

    // ── 7. writing q4: type, word count, autosave ──
    const essay =
      'Dear Ms. Tran,\n\nI would like to request two days of leave next month to help my family move to a new house.\nI will finish all pending tasks before the leave and my colleague will cover urgent requests.\n\nThank you.\nBest regards, Linh.';
    await typing(page, essay);
    await page.waitForTimeout(2500); // 900ms debounce + PATCH
    const wc = await page.locator('text=Từ:').textContent();
    check(W, wc && parseInt(wc.replace(/\D/g, '')) >= 40, 'word count rendered', wc || '');
    await page.screenshot({ path: `${EV}/writing-${name}.png`, fullPage: true });
    log(name, `STEP writing typed, word count: ${wc}`);

    // ── 8. reload → resume → content restored ──
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ql-editor', { timeout: 15000 });
    await page.waitForTimeout(500);
    const restored = await page.locator('.ql-editor').innerText();
    check(W, restored.includes('I would like to request two days of leave'), 'writing restored after reload', hash(restored));
    log(name, 'STEP reload → resume → writing text restored (autosave persisted)');
    await page.screenshot({ path: `${EV}/writing-restored-${name}.png`, fullPage: true });

    // ── 9. append text, move to q5, type, submit ──
    await typing(page, ' Additional note: I can be reached by email during the leave.');
    await page.waitForTimeout(2000);
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('.ql-editor', { timeout: 10000 });
    await typing(page, 'I visited the restaurant last week. The food was fresh and the staff were friendly. I suggest adding an online reservation system.');
    await page.waitForTimeout(2000);

    await page.locator('button:has-text("NỘP BÀI")').click();
    await page.waitForURL(/dang-xu-ly/, { timeout: 30000 });
    log(name, 'STEP submitted → processing page');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${EV}/processing-${name}.png`, fullPage: true });

    // verify attempt status via API
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const statusRes = await fetch(`${BASE}/api/toeic-attempts/${attemptId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const attempt = await statusRes.json();
    log(name, `STEP attempt status after submit: ${attempt.status}`);
    check(W, ['SUBMITTED', 'GRADING', 'COMPLETED'].includes(attempt.status), 'attempt no longer IN_PROGRESS', attempt.status);
  } catch (err) {
    console.error(`[${name}] UNHANDLED JOURNEY ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png`, fullPage: true }); } catch { /* noop */ }
    try { check(W, false, 'journey unhandled error: ' + (err instanceof Error ? err.message : String(err))); } catch (e) { console.error('check in catch failed:', e); }
  }

  await ctx.close();
  return { W, attemptId };
}

// ──────────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

const desktop = await runViewport(browser, { width: 1440, height: 900 }, 'desktop');
const mobile = await runViewport(browser, { width: 390, height: 844 }, 'mobile');

await browser.close();

// ── write evidence files ────────────────────────────────────────────────

const render = (v, result) => [
  `S5-FE journey — ${v} (viewport 1440x900 desktop / 390x844 mobile)`,
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
  `${EV}/upload-retry.txt`,
  [
    'S5-FE upload lifecycle (presign → PUT, bounded retries, no base64)',
    `timestamp: ${new Date().toISOString()}`,
    '',
    'Backend dev mode uses createTestMediaAdapter (mock presigned URL) — real S3 is UNAVAILABLE',
    '(no AWS creds), so the direct PUT to test-bucket.s3.test.amazonaws.com fails by design.',
    'This is expected and recorded as the retryable failure path.',
    '',
    ...uploads.desktop,
    '',
    ...uploads.mobile,
  ].join('\n')
);

writeFileSync(
  `${EV}/console-network.txt`,
  [
    'S5-FE console (errors/warnings) + network request/response proof',
    `timestamp: ${new Date().toISOString()}`,
    '',
    '=== DESKTOP console ===', ...consoleLog.desktop,
    '',
    '=== MOBILE console ===', ...consoleLog.mobile,
    '',
    '=== DESKTOP network ===', ...network.desktop,
    '',
    '=== MOBILE network ===', ...network.mobile,
  ].join('\n')
);

console.log('\n--- SUMMARY ---');
console.log('desktop checks:', JSON.stringify(desktop.W.checks, null, 1));
console.log('mobile checks:', JSON.stringify(mobile.W.checks, null, 1));
console.log('evidence written to', EV);
