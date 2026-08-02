/**
 * R2-SW — fresh full SW journey (desktop 1280x800 + mobile 375x812).
 * catalog SW -> detail -> mic test (fake media) -> speaking q1/q3/q5/q8 ->
 * writing q1/q6/q8 -> submit -> processing -> result.
 * Auth: HttpOnly cookie (no token in localStorage); UI login.
 * S3 PUT is expected to fail (dev mock adapter, no S3) — recorded + explained.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

const BASE = 'http://localhost:5173';
const EV = '/home/linhnx/Projects/mini-toeic.score/.agent/evidence/R2-SW';
mkdirSync(EV, { recursive: true });

const OWNER = { email: 'seed.owner@example.com', password: 'seed-password-123' };
const SLUG = 'anish-full-sw-001';
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 },
};

const REFS = {
  desktop: {
    catalog: 'desktop01-catalog-sw', detail: 'desktop20-exam-sw-detail',
    mic: 'desktop21-exam-sw-mic-setup', micReady: 'desktop21b-exam-sw-mic-ready',
    directions: 'desktop22-exam-sw-speaking-directions', q1prep: 'desktop23-exam-sw-speaking-q1-prep',
    q3img: 'desktop24-exam-sw-speaking-q3-image', q5: 'desktop25-exam-sw-speaking-q5',
    q8: 'desktop26-exam-sw-speaking-q8', wStart: 'desktop27-exam-sw-writing-start',
    wq1: 'desktop28-exam-sw-writing-q1', wq6: 'desktop29-exam-sw-writing-q6-email',
    wq8: 'desktop30-exam-sw-writing-q8-essay', processing: 'desktop31-exam-sw-processing',
    result: 'desktop32-exam-sw-result',
  },
  mobile: {
    catalog: 'mobile01-catalog-sw', detail: 'mobile20-exam-sw-detail',
    mic: 'mobile21-exam-sw-mic-setup', micReady: 'mobile21b-exam-sw-mic-ready',
    directions: 'mobile22-exam-sw-speaking-directions', q1prep: 'mobile23-exam-sw-speaking-q1-prep',
    q3img: 'mobile24-exam-sw-speaking-q3-image', q5: 'mobile25-exam-sw-speaking-q5',
    q8: 'mobile26-exam-sw-speaking-q8', wStart: 'mobile03-exam-sw-writing-start',
    wq1: 'mobile04-exam-sw-writing-q1', wq6: 'mobile05-exam-sw-writing-q6-email',
    wq8: 'mobile06-exam-sw-writing-q8-essay', processing: 'mobile07-exam-sw-processing',
    result: 'mobile08-exam-sw-result',
  },
};

const out = { desktop: [], mobile: [] };
const consoleLog = { desktop: [], mobile: [] };
const network = { desktop: [], mobile: [] };
const failed = { desktop: [], mobile: [] };
const media = { desktop: [], mobile: [] };

function log(v, s) { out[v].push(`[${new Date().toISOString()}] ${s}`); console.log(`[${v}] ${s}`); }
function check(W, cond, label, extra = '') {
  W.checks.push(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
  if (!cond) W.errors++;
  return cond;
}

async function apiCookie(cookieJar, method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: cookieJar },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, body: json, text };
}

async function newContext(browser, viewport, name) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    permissions: ['microphone'],
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) consoleLog[name].push(`${m.type().toUpperCase()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleLog[name].push(`PAGEERROR: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/')) network[name].push(`REQ ${r.method()} ${u.replace(BASE, '')}`);
    if (u.includes('test-bucket.s3.test')) media[name].push(`REQ-PUT ${r.method()} ${u.slice(0, 90)}`);
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.includes('test-bucket.s3.test')) media[name].push(`PUT-FAILED ${u.slice(0, 90)} :: ${r.failure()?.errorText}`);
    else failed[name].push(`REQ-FAILED ${r.method()} ${u.slice(0, 140)} :: ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/')) network[name].push(`RES ${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`);
    if (u.includes('test-bucket.s3.test')) media[name].push(`RES-PUT ${r.status()} ${u.slice(0, 90)}`);
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

async function imgSrc(page) {
  const img = page.locator('img[alt="Question prompt"]');
  if (await img.count() === 0) return null;
  return page.evaluate((el) => ({ src: el.src, w: el.naturalWidth, h: el.naturalHeight }), await img.first().elementHandle());
}

/** Record one speaking question (already in recording-ready state): record ~2s, stop, playback. */
async function recordOne(page, name, label, W) {
  await page.locator('button[aria-label="Start recording"]').click();
  await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 8000 });
  await page.waitForTimeout(2000);
  await page.locator('button[aria-label="Stop recording"]').click();
  await page.locator('button:has-text("Play Recording")').waitFor({ timeout: 8000 });
  check(W, true, `speaking ${label} blob captured + playback ready`);
  log(name, `STEP speaking ${label}: recorded ~2s, blob URL ready, upload enqueued`);
}

async function typing(page, text) {
  await page.locator('.ql-editor').click();
  await page.keyboard.type(text, { delay: 8 });
}

const WRITING_TEXTS = {
  q1: 'A man is reading a menu at a table inside a cozy restaurant with large windows and wooden furniture.',
  q2: 'Two colleagues are reviewing documents together in a bright modern office with a large window.',
  q3: 'A delivery truck is parked in front of a large warehouse with boxes stacked near the entrance.',
  q4: 'Customers are waiting in line at the reception desk of the hotel while staff assist them.',
  q5: 'The chef is preparing fresh food in the kitchen of the hotel restaurant with a white apron.',
  q6: 'Dear Ms. Tran, I would like to suggest a workshop on effective time management. Many of us juggle multiple deadlines every day, and this topic would help us plan better, prioritize tasks, and reduce stress. It would also be useful for both new and experienced staff members. Thank you for considering my suggestion. Best regards, Linh.',
  q7: 'Dear Mr. Nam, I understand the break room needs maintenance. I suggest opening the small meeting room on the second floor as a temporary break area during the week. Best regards, Hoa.',
  q8: 'Remote work has become common in many companies, and I believe it benefits both employees and employers. For employees, working from home saves commuting time and reduces costs. For employers, remote work can lower office expenses and allow hiring from a wider area. However, companies must invest in clear communication tools and regular check-ins to keep teams connected. In conclusion, when managed well, remote work is a win for everyone.',
};

async function writingQuestion(page, name, W, key, shotId) {
  await page.waitForSelector('.ql-editor', { timeout: 10000 });
  const wcBefore = await page.locator('text=Từ:').innerText();
  check(W, wcBefore.includes('Từ:'), `${key} word-count label visible`, wcBefore.trim());
  await typing(page, WRITING_TEXTS[key]);
  await page.waitForTimeout(3200); // 900ms autosave debounce + PATCH
  const wcText = await page.locator('text=Từ:').innerText();
  const n = parseInt(wcText.replace(/\D/g, ''), 10);
  check(W, n >= 10, `${key} word count rendered (${n})`, wcText.trim());
  const body = await page.locator('body').innerText();
  check(W, /Đã lưu/.test(body), `${key} autosaved (Đã lưu)`);
  if (shotId) await shot(page, name, shotId, `writing ${key} typed + word count`);
  log(name, `STEP writing ${key}: typed, word count ${n}, autosaved`);
}

async function shot(page, name, id, label) {
  await page.screenshot({ path: `${EV}/${id}.png` });
  log(name, `SCREENSHOT ${label} -> ${id}.png`);
}

async function runJourney(browser, viewport, name) {
  const { ctx, page } = await newContext(browser, viewport, name);
  const R = REFS[name];
  const W = { errors: 0, checks: [] };
  let attemptId = null, cookieJar = '';
  const done = new Set();
  const s = async (id, label) => { if (done.has(id)) return; done.add(id); await shot(page, name, id, label); };

  try {
    // 1. login
    await login(page);
    cookieJar = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    check(W, cookieJar.includes('token='), 'session HttpOnly cookie in jar');
    log(name, 'STEP logged in as seed.owner (cookie session)');

    // 2. catalog SW tab
    await page.goto(`${BASE}/thi-thu`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Thư viện đề thi', { timeout: 12000 });
    await page.locator('button:has-text("Speaking & Writing")').click();
    await page.waitForSelector(`a[href="/thi-thu/${SLUG}"]`, { timeout: 12000 });
    await s(R.catalog, 'catalog SW tab');
    check(W, (await page.locator(`a[href="/thi-thu/${SLUG}"]`).count()) > 0, 'SW exam card visible on SW tab');

    // 3. exam detail
    await page.locator(`a[href="/thi-thu/${SLUG}"]`).click();
    await page.waitForURL(new RegExp(`/thi-thu/${SLUG}`), { timeout: 12000 });
    await page.waitForSelector('text=Anish Full Practice 1 — Speaking & Writing', { timeout: 12000 });
    await s(R.detail, 'exam detail');
    log(name, 'STEP exam detail rendered');

    // 4. mode dialog -> start
    await page.locator('button:has-text("Bắt đầu")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
    await page.locator('[role="dialog"] button:has-text("Bắt đầu")').click();
    await page.waitForURL(/lam-bai-sw\/(\d+)/, { timeout: 15000 });
    attemptId = page.url().match(/lam-bai-sw\/(\d+)/)[1];
    check(W, !!attemptId, `SW attempt created (id=${attemptId})`);

    // 5. mic test
    await page.waitForSelector('text=Microphone Setup', { timeout: 15000 });
    await s(R.mic, 'mic test screen');
    check(W, (await page.locator('button:has-text("Allow Microphone Access")').count()) > 0, 'mic test "Allow Microphone Access" shown');
    await page.locator('button:has-text("Allow Microphone Access")').click();
    await page.waitForSelector('button:has-text("Continue to Test")', { timeout: 15000 });
    await s(R.micReady, 'mic test passed (ready)');
    check(W, true, 'mic granted via fake media device');
    await page.locator('button:has-text("Continue to Test")').click();

    // 6. directions
    await page.waitForSelector('text=DIRECTIONS', { timeout: 10000 });
    await s(R.directions, 'speaking directions');
    await page.locator('button:has-text("BẮT ĐẦU")').click();

    // 7. speaking q1 (read-aloud) — prep state screenshot
    await page.waitForSelector('button[aria-label="Start preparation"]', { timeout: 8000 });
    await page.locator('button[aria-label="Start preparation"]').click();
    await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
    await s(R.q1prep, 'speaking q1 prep state');
    check(W, (await page.locator('text=Preparation Time').count()) > 0, 'speaking q1 prep timer active');
    const q1body = await page.locator('body').innerText();
    check(W, /health fair|information desk/.test(q1body), 'q1 read-aloud text prompt shown');
    await page.locator('button[aria-label="Skip preparation"]').click();
    await page.waitForSelector('button[aria-label="Start recording"]', { timeout: 5000 });
    await recordOne(page, name, 'q1', W);

    // 8. speaking q2 + q3 (describe-picture, SVG)
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('button[aria-label="Start preparation"]', { timeout: 8000 });
    await page.locator('button[aria-label="Start preparation"]').click();
    await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
    await page.locator('button[aria-label="Skip preparation"]').click();
    await recordOne(page, name, 'q2', W);

    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('button[aria-label="Start preparation"]', { timeout: 8000 });
    await page.locator('button[aria-label="Start preparation"]').click();
    await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
    const q3img = await imgSrc(page);
    check(W, !!q3img && q3img.src.startsWith('data:image/svg+xml;base64'), 'q3 describe-picture SVG image (src data:image/svg+xml;base64)', JSON.stringify(q3img));
    check(W, !!q3img && q3img.w > 0, 'q3 image rendered (naturalWidth>0)', JSON.stringify(q3img));
    await s(R.q3img, 'speaking q3 describe-picture (SVG image)');
    await page.locator('button[aria-label="Skip preparation"]').click();
    await recordOne(page, name, 'q3', W);

    // 9. speaking q4 + q5 (respond to questions)
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('button[aria-label="Start preparation"]', { timeout: 8000 });
    await page.locator('button[aria-label="Start preparation"]').click();
    await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
    await page.locator('button[aria-label="Skip preparation"]').click();
    await recordOne(page, name, 'q4', W);

    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('button[aria-label="Start preparation"]', { timeout: 8000 });
    await page.locator('button[aria-label="Start preparation"]').click();
    await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
    await s(R.q5, 'speaking q5 respond-to-questions');
    const q5body = await page.locator('body').innerText();
    check(W, /Friday mornings|Do you think/.test(q5body), 'q5 respond-to-questions prompt shown');
    await page.locator('button[aria-label="Skip preparation"]').click();
    await recordOne(page, name, 'q5', W);

    // 10. speaking q6/q7/q8 (respond using information)
    for (const q of ['q6', 'q7']) {
      await page.locator('button:has-text("Câu tiếp")').click();
      await page.waitForSelector('button[aria-label="Start preparation"]', { timeout: 8000 });
      await page.locator('button[aria-label="Start preparation"]').click();
      await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
      await page.locator('button[aria-label="Skip preparation"]').click();
      await recordOne(page, name, q, W);
    }
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('button[aria-label="Start preparation"]', { timeout: 8000 });
    await page.locator('button[aria-label="Start preparation"]').click();
    await page.waitForSelector('text=Preparation Time', { timeout: 5000 });
    await s(R.q8, 'speaking q8 respond-using-information');
    const q8body = await page.locator('body').innerText();
    check(W, /subscription|Premium|Plus/.test(q8body), 'q8 information prompt (plans table) shown');
    await page.locator('button[aria-label="Skip preparation"]').click();
    await recordOne(page, name, 'q8', W);
    log(name, 'STEP all 8 speaking questions recorded');

    // 11. writing q1 (picture, image)
    await page.locator('button:has-text("Câu tiếp")').click();
    await page.waitForSelector('.ql-editor', { timeout: 10000 });
    const w1img = await imgSrc(page);
    check(W, !!w1img && w1img.src.startsWith('data:image/svg+xml;base64'), 'writing q1 picture SVG image (src data:image/svg+xml;base64)', JSON.stringify(w1img));
    check(W, !!w1img && w1img.w > 0, 'writing q1 image rendered (naturalWidth>0)');
    await s(R.wStart, 'writing start (q1 picture)');
    await writingQuestion(page, name, W, 'q1', R.wq1);

    // 12. writing q2-q5 (short)
    for (const q of ['q2', 'q3', 'q4', 'q5']) {
      await page.locator('button:has-text("Câu tiếp")').click();
      await writingQuestion(page, name, W, q, null);
    }

    // 13. writing q6 (email) / q7 / q8 (essay)
    await page.locator('button:has-text("Câu tiếp")').click();
    await writingQuestion(page, name, W, 'q6', R.wq6);
    await page.locator('button:has-text("Câu tiếp")').click();
    await writingQuestion(page, name, W, 'q7', null);
    await page.locator('button:has-text("Câu tiếp")').click();
    await writingQuestion(page, name, W, 'q8', R.wq8);
    log(name, 'STEP writing q1/q6/q8 answered (all 8 writing questions done)');

    // 14. submit -> processing
    await page.locator('button:has-text("NỘP BÀI")').click();
    await page.waitForURL(/dang-xu-ly\/(\d+)/, { timeout: 40000 });
    await page.waitForTimeout(900);
    const procText = await page.locator('body').innerText();
    check(W, /Đang chờ xếp hàng|AI đang chấm|Hoàn tất chấm/.test(procText), 'processing page progress UI rendered');
    await s(R.processing, 'processing (queued/processing)');
    log(name, `STEP submitted -> processing page (attempt ${attemptId})`);

    // 15. wait COMPLETED -> result
    await page.waitForURL(new RegExp(`/thi-thu/ket-qua/${attemptId}`), { timeout: 90000 });
    await page.waitForSelector('text=AI GRADING RESULT', { timeout: 20000 });
    await page.waitForTimeout(1200);
    const resText = await page.locator('body').innerText();
    check(W, /AI GRADING RESULT/.test(resText), 'result certificate header');
    check(W, /TOTAL SCORE/.test(resText), 'TOTAL SCORE section');
    check(W, /400/.test(resText), 'total score 400 displayed');
    check(W, /FINAL/.test(resText), 'status FINAL tag');
    check(W, /SPEAKING|Speaking/i.test(resText) && /WRITING|Writing/i.test(resText), 'Speaking + Writing sections');
    const gs = await apiCookie(cookieJar, 'GET', `/toeic-attempts/${attemptId}/grading-status`);
    check(W, gs.body?.status === 'COMPLETED', `grading job COMPLETED (got ${gs.body?.status})`);
    const at = await apiCookie(cookieJar, 'GET', `/toeic-attempts/${attemptId}`);
    check(W, at.body?.status === 'COMPLETED', `attempt status COMPLETED (got ${at.body?.status})`);
    check(W, Array.isArray(at.body?.responses) && at.body.responses.length === 8, `8 writing responses persisted server-side (got ${at.body?.responses?.length ?? 0})`);
    const rr = await apiCookie(cookieJar, 'GET', `/toeic-attempts/${attemptId}/result`);
    check(W, rr.body?.totalScore === 400, `API totalScore=400 (got ${rr.body?.totalScore})`);
    check(W, rr.body?.status === 'FINAL', `API result status FINAL (got ${rr.body?.status})`);
    await s(R.result, 'SW result certificate');
    log(name, `STEP result verified: status=${rr.body?.status} totalScore=${rr.body?.totalScore}`);
    return { W, attemptId, finalScore: rr.body?.totalScore };
  } catch (err) {
    console.error(`[${name}] UNHANDLED ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { check(W, false, 'journey unhandled error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220)); } catch { /* noop */ }
    return { W, attemptId, finalScore: null };
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const desktop = await runJourney(browser, VIEWPORTS.desktop, 'desktop');
const mobile = await runJourney(browser, VIEWPORTS.mobile, 'mobile');
await browser.close();

const now = new Date().toISOString();
const CHECK = (W) => `PASS=${W.checks.filter((c) => c.startsWith('PASS')).length} FAIL=${W.checks.filter((c) => c.startsWith('FAIL')).length}`;

function render(name, label, r) {
  return [
    `R2-SW journey (${label}) — viewport ${JSON.stringify(VIEWPORTS[name])}`,
    `timestamp: ${now}`,
    `attemptId: ${r.attemptId ?? 'n/a'}`,
    `finalScore: ${r.finalScore ?? 'n/a'}`,
    `errors: ${r.W.errors}`,
    `CHECKLIST | R2-SW (${name}) | ${CHECK(r.W)}`,
    ...r.W.checks.map((c) => `  ${c}`),
    '',
    'STEP transcript:',
    ...out[name],
  ].join('\n');
}

writeFileSync(`${EV}/journey-desktop.txt`, render('desktop', 'desktop 1280x800', desktop));
writeFileSync(`${EV}/journey-mobile.txt`, render('mobile', 'mobile 375x812', mobile));

writeFileSync(`${EV}/console-network-desktop.txt`, [
  'R2-SW console (errors/warnings) + network (/api) + media PUT + failed requests — desktop',
  `timestamp: ${now}`,
  '', '=== CONSOLE ===', ...(consoleLog.desktop.length ? consoleLog.desktop : ['(none)']),
  '', '=== API NETWORK ===', ...(network.desktop.length ? network.desktop : ['(none)']),
  '', '=== MEDIA (S3 PUT) ===', ...(media.desktop.length ? media.desktop : ['(none)']),
  '', '=== FAILED REQUESTS ===', ...(failed.desktop.length ? failed.desktop : ['(none)']),
].join('\n'));

writeFileSync(`${EV}/console-network-mobile.txt`, [
  'R2-SW console (errors/warnings) + network (/api) + media PUT + failed requests — mobile',
  `timestamp: ${now}`,
  '', '=== CONSOLE ===', ...(consoleLog.mobile.length ? consoleLog.mobile : ['(none)']),
  '', '=== API NETWORK ===', ...(network.mobile.length ? network.mobile : ['(none)']),
  '', '=== MEDIA (S3 PUT) ===', ...(media.mobile.length ? media.mobile : ['(none)']),
  '', '=== FAILED REQUESTS ===', ...(failed.mobile.length ? failed.mobile : ['(none)']),
].join('\n'));

console.log('\n--- R2-SW SUMMARY ---');
for (const [n, r] of Object.entries({ desktop, mobile })) {
  console.log(`${n}: ${CHECK(r.W)} attemptId=${r.attemptId ?? '-'} score=${r.finalScore ?? '-'}`);
  for (const c of r.W.checks.filter((x) => x.startsWith('FAIL'))) console.log(`  ${c}`);
}
console.log('evidence written to', EV);
process.exit(desktop.W.errors + mobile.W.errors ? 1 : 0);
