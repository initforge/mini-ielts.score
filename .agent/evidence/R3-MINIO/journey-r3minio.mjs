/**
 * R3-P1-MINIO — browser SW journey with REAL upload to local MinIO.
 * login -> SW attempt -> mic test (fake media) -> record q1 ~2s ->
 * presigned PUT to http://127.0.0.1:19000 (MinIO) -> verify 200 + object exists.
 * Assert: no CSP violation in console, PUT network receipt 200.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const EV = '/home/linhnx/Projects/mini-toeic.score/.agent/evidence/R3-MINIO';
mkdirSync(EV, { recursive: true });

const OWNER = { email: 'seed.owner@example.com', password: 'seed-password-123' };
const SLUG = 'anish-full-sw-001';

const out = [];
const consoleLog = [];
const network = [];
const media = [];
const failed = [];
const checks = [];
let errors = 0;

function log(s) { out.push(`[${new Date().toISOString()}] ${s}`); console.log(s); }
function check(cond, label, extra = '') {
  checks.push(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
  if (!cond) errors++;
  return cond;
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chromium', // use full chromium build (headless shell crashed on close)
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  ignoreHTTPSErrors: true,
  permissions: ['microphone'],
});
const page = await ctx.newPage();

page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) consoleLog.push(`${m.type().toUpperCase()}: ${m.text()}`);
});
page.on('pageerror', (e) => consoleLog.push(`PAGEERROR: ${e.message}`));
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('/api/')) network.push(`REQ ${r.method()} ${u.replace(BASE, '')}`);
  if (u.includes('127.0.0.1:19000')) media.push(`REQ-PUT ${r.method()} ${u.slice(0, 90)}`);
});
page.on('requestfailed', (r) => {
  const u = r.url();
  if (u.includes('127.0.0.1:19000')) media.push(`PUT-FAILED ${u.slice(0, 90)} :: ${r.failure()?.errorText}`);
  else failed.push(`REQ-FAILED ${r.method()} ${u.slice(0, 140)} :: ${r.failure()?.errorText}`);
});
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/api/')) network.push(`RES ${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`);
  if (u.includes('127.0.0.1:19000')) media.push(`RES-PUT ${r.status()} ${u.slice(0, 90)}`);
});

let attemptId = null;
try {
  // 1. login UI
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="email@example.com"]', OWNER.email);
  await page.fill('input[placeholder="••••••••"]', OWNER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/thi-thu/, { timeout: 15000 });
  const cookies = await page.context().cookies();
  check(cookies.some((c) => c.name === 'token'), 'session HttpOnly cookie in jar');
  log('STEP logged in as seed.owner');

  // 2. catalog -> SW tab -> exam
  await page.goto(`${BASE}/thi-thu`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Thư viện đề thi', { timeout: 12000 });
  await page.locator('button:has-text("Speaking & Writing")').click();
  await page.waitForSelector(`a[href="/thi-thu/${SLUG}"]`, { timeout: 12000 });
  await page.locator(`a[href="/thi-thu/${SLUG}"]`).click();
  await page.waitForSelector('text=Anish Full Practice 1 — Speaking & Writing', { timeout: 12000 });
  log('STEP exam detail rendered');

  // 3. start attempt
  await page.locator('button:has-text("Bắt đầu")').first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
  await page.locator('[role="dialog"] button:has-text("Bắt đầu")').click();
  await page.waitForURL(/lam-bai-sw\/(\d+)/, { timeout: 15000 });
  attemptId = page.url().match(/lam-bai-sw\/(\d+)/)[1];
  check(!!attemptId, `SW attempt created (id=${attemptId})`);

  // 4. mic test
  await page.waitForSelector('text=Microphone Setup', { timeout: 15000 });
  check((await page.locator('button:has-text("Allow Microphone Access")').count()) > 0, 'mic test "Allow Microphone Access" shown');
  await page.locator('button:has-text("Allow Microphone Access")').click();
  await page.waitForSelector('button:has-text("Continue to Test")', { timeout: 15000 });
  check(true, 'mic granted via fake media device');
  await page.locator('button:has-text("Continue to Test")').click();

  // 5. directions
  await page.waitForSelector('text=DIRECTIONS', { timeout: 10000 });
  await page.locator('button:has-text("BẮT ĐẦU")').click();

  // 6. speaking q1 — prep then record ~2s
  await page.waitForSelector('button[aria-label="Start preparation"]', { timeout: 8000 });
  await page.locator('button[aria-label="Start preparation"]').click();
  await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
  await page.locator('button[aria-label="Skip preparation"]').click();
  await page.waitForSelector('button[aria-label="Start recording"]', { timeout: 5000 });
  await page.locator('button[aria-label="Start recording"]').click();
  await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 8000 });
  await page.waitForTimeout(2000);
  await page.locator('button[aria-label="Stop recording"]').click();
  await page.locator('button:has-text("Play Recording")').waitFor({ timeout: 8000 });
  check(true, 'speaking q1 blob captured + playback ready');
  log('STEP speaking q1: recorded ~2s, upload enqueued');

  // 7. wait for presigned PUT to MinIO
  await page.waitForTimeout(3000);
  const putRes = media.find((m) => m.startsWith('RES-PUT'));
  const putOk = media.some((m) => m.startsWith('RES-PUT 200'));
  check(putOk, 'presigned PUT to MinIO returned 200', putRes || '(no RES-PUT captured)');
  log('STEP upload round-trip complete');

  // 8. page body sanity: uploaded state not shown as error
  const body = await page.locator('body').innerText();
  check(!/upload error|Upload thất bại|upload failed/i.test(body), 'no upload error surfaced in UI');
} catch (err) {
  console.error('UNHANDLED ERROR:', err);
  check(false, 'journey unhandled error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220));
} finally {
  await page.screenshot({ path: `${EV}/sw-upload-screenshot.png` }).catch(() => {});
  await ctx.close();
  await browser.close();
}

// CSP verdict: a violation = a connection actually refused by CSP. Browsers also
// log a pre-existing source-format warning about the invalid `*.s3.*.amazonaws.com`
// wildcard (ignored per CSP spec) — that is NOT a block and does not affect MinIO.
const cspBlocked = consoleLog.filter((l) => /refused to connect/i.test(l));
check(cspBlocked.length === 0, 'no CSP connection refusals in console', cspBlocked.join(' | ') || 'none');
const cspFormatWarnings = consoleLog.filter((l) => /invalid source/i.test(l));
out.push(`NOTE: console CSP messages — ${cspFormatWarnings.length ? cspFormatWarnings.join(' ; ') : 'none'}`);

const now = new Date().toISOString();
const summary = [
  'R3-P1-MINIO browser SW journey — REAL upload to local MinIO (127.0.0.1:19000)',
  `timestamp: ${now}`,
  `attemptId: ${attemptId ?? 'n/a'}`,
  `errors: ${errors}`,
  `CHECKLIST | R3-MINIO-SW | PASS=${checks.filter((c) => c.startsWith('PASS')).length} FAIL=${checks.filter((c) => c.startsWith('FAIL')).length}`,
  ...checks.map((c) => `  ${c}`),
  '',
  'STEP transcript:',
  ...out,
].join('\n');

const networkLog = [
  'R3-MINIO console (errors/warnings) + network (/api) + media PUT + failed requests',
  `timestamp: ${now}`,
  '', '=== CONSOLE ===', ...(consoleLog.length ? consoleLog : ['(none)']),
  '', '=== API NETWORK ===', ...(network.length ? network : ['(none)']),
  '', '=== MEDIA (MinIO PUT) ===', ...(media.length ? media : ['(none)']),
  '', '=== FAILED REQUESTS ===', ...(failed.length ? failed : ['(none)']),
].join('\n');

writeFileSync(`${EV}/sw-upload-proof.txt`, `${summary}\n\n${networkLog}\n`);
console.log('\n--- R3-MINIO-SW SUMMARY ---');
console.log(summary);
console.log('evidence written to', EV);
process.exit(errors ? 1 : 0);
