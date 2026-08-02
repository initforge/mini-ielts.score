/**
 * S6-FE XSS probe — separate run (fresh browser) to avoid the long-lived
 * browser + vite HMR flakiness seen after ~10 contexts in journey-script.mjs.
 *
 * AC19: typing `<script>alert(1)</script><img src=x onerror=alert(2)>` into
 * the Quill writing editor must be stored as plain text and rendered inert
 * (DOMPurify) on the review detail page — no alert dialog, no onerror.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { createHash } from 'crypto';

const BASE = 'http://localhost:5173';
const EV = '/home/linhnx/Projects/mini-toeic.score/.agent/evidence/S6-FE';
mkdirSync(EV, { recursive: true });
const TOKEN = readFileSync('/tmp/opencode/s6fe-token.txt', 'utf8').trim();

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const out = { 'xss-desktop': [], 'xss-mobile': [] };
const consoleLog = { 'xss-desktop': [], 'xss-mobile': [] };
const network = { 'xss-desktop': [], 'xss-mobile': [] };

function log(name, s) { out[name].push(s); console.log(`[${name}] ${s}`); }
function check(W, cond, label, extra = '') {
  W.checks.push(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
  if (!cond) W.errors++;
  return cond;
}
function hash(s) { return createHash('sha256').update(String(s)).digest('hex').slice(0, 16); }

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

async function typing(page, text) {
  await page.locator('.ql-editor').click();
  await page.keyboard.type(text, { delay: 15 });
}

async function runXSS(browser, viewport, name) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, permissions: ['microphone'] });
  await ctx.addInitScript((t) => { try { localStorage.setItem('token', t); } catch { /* noop */ } }, TOKEN);
  const page = await ctx.newPage();
  const W = { errors: 0, checks: [] };
  const dialogs = [];
  const pageErrors = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleLog[name].push(`${m.type().toUpperCase()}: ${m.text()}`); });
  page.on('response', (r) => { if (r.url().includes('/api/')) network[name].push(`RES ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
  const shot = async (key, label, fullPage = false) => { await page.screenshot({ path: `${EV}/${key}-${name}.png`, fullPage }); log(name, `SCREENSHOT ${label} → ${key}-${name}.png`); };
  let attemptId = null;
  try {
    const PAYLOAD = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const created = await api(TOKEN, 'POST', '/toeic-exams/2/attempts', { mode: 'EXAM' });
    attemptId = created.body?.attemptId;
    check(W, !!attemptId, `XSS attempt created via API (id=${attemptId})`);

    await page.goto(`${BASE}/thi-thu/lam-bai-sw/${attemptId}`, { waitUntil: 'domcontentloaded' });
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { await page.waitForSelector('text=Microphone Setup', { timeout: 12000 }); break; }
      catch {
        if (attempt === 3) throw new Error('SW runner never mounted (3 attempts)');
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
    await page.waitForTimeout(3000); // autosave PATCH

    const editorState = await page.evaluate(() => {
      const editor = document.querySelector('.ql-editor');
      const badAttrs = editor
        ? [...editor.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => /^on/i.test(a.name))).length
        : -1;
      return {
        scriptEls: editor?.querySelectorAll('script').length ?? -1,
        eventHandlerAttrs: badAttrs,
        text: editor?.innerText ?? '',
      };
    });
    check(W, editorState.scriptEls === 0, 'editor: no <script> element');
    check(W, editorState.eventHandlerAttrs === 0, 'editor: no event-handler attributes (on*)', `attrs=${editorState.eventHandlerAttrs}`);
    check(W, editorState.text.includes('<script>alert(1)</script>'), 'editor: payload stored as literal text');
    await shot('xss-editor', 'XSS payload typed in writing editor', false);

    await page.locator('button:has-text("NỘP BÀI")').click();
    await page.waitForURL(/ket-qua\/\d+/, { timeout: 60000 });
    await page.waitForSelector('text=AI GRADING RESULT', { timeout: 20000 });
    await page.goto(`${BASE}/thi-thu/ket-qua/${attemptId}/chi-tiet`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Xem lại bài thi', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const dom = await page.evaluate(() => {
      // Framework bundles legitimately inject <script> tags; the XSS check is
      // whether the payload became an executable script/attribute anywhere.
      const evilScripts = [...document.querySelectorAll('script')]
        .filter((s) => /alert\(|onerror/.test(s.textContent ?? '')).length;
      const cardScripts = document.querySelectorAll('.bg-white.rounded-xl script').length;
      const imgs = [...document.querySelectorAll('img[src="x"]')];
      return {
        evilScripts,
        cardScripts,
        onerrorAttrs: document.querySelectorAll('[onerror]').length,
        imgWithoutHandler: imgs.length === 0 || imgs.every((i) => !i.hasAttribute('onerror')),
      };
    });
    check(W, dialogs.length === 0, 'no alert dialog fired', `dialogs=${dialogs.length}`);
    check(W, pageErrors.length === 0, 'no page JS error', pageErrors.join('; ').slice(0, 120));
    check(W, dom.evilScripts === 0, 'no executable script carrying the payload', `evilScripts=${dom.evilScripts}`);
    check(W, dom.cardScripts === 0, 'no <script> inside review question cards');
    check(W, dom.onerrorAttrs === 0, 'no [onerror] attribute in rendered DOM');
    check(W, dom.imgWithoutHandler, 'img tag rendered without onerror handler');
    await shot('xss-writing', 'XSS payload rendered sanitized in review', true);
    log(name, `STEP XSS render-boundary verified (dialogs=${dialogs.length}, pageErrors=${pageErrors.length})`);

    const at = await api(TOKEN, 'GET', `/toeic-attempts/${attemptId}`);
    const q25 = (at.body?.responses ?? []).find((r) => r.question_id === 25);
    check(W, !!q25?.text_response && q25.text_response.includes('<script>alert(1)</script>'),
      'backend stores payload verbatim as plain text (sanitize at FE render boundary)',
      hash(q25?.text_response ?? ''));
    return { W, attemptId };
  } catch (err) {
    console.error(`[${name}] UNHANDLED XSS ERROR:`, err);
    try { await page.screenshot({ path: `${EV}/journey-error-${name}.png` }); } catch { /* noop */ }
    try { check(W, false, 'xss journey error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 220)); } catch { /* noop */ }
    return { W, attemptId };
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const desktop = await runXSS(browser, VIEWPORTS.desktop, 'xss-desktop');
const mobile = await runXSS(browser, VIEWPORTS.mobile, 'xss-mobile');
await browser.close();

const now = new Date().toISOString();
const render = (name, result) => [
  `S6-FE AC19 XSS probe — viewport ${JSON.stringify(VIEWPORTS[name])}`,
  `timestamp: ${now}`,
  `attemptId: ${result.attemptId ?? 'n/a'}`,
  `errors: ${result.W.errors}`,
  '',
  `CHECKLIST | AC19 (${name}) | PASS=${result.W.checks.filter((c) => c.startsWith('PASS')).length} FAIL=${result.W.errors}`,
  ...result.W.checks.map((c) => `  ${c}`),
  '',
  'STEP transcript:',
  ...out[name],
].join('\n');

writeFileSync(`${EV}/xss-desktop.txt`, render('xss-desktop', desktop));
writeFileSync(`${EV}/xss-mobile.txt`, render('xss-mobile', mobile));
writeFileSync(`${EV}/xss-console-network.txt`, [
  'S6-FE XSS probe console (errors/warnings) + /api network proof',
  `timestamp: ${now}`,
  '',
  '=== XSS DESKTOP console ===', ...consoleLog['xss-desktop'],
  '',
  '=== XSS MOBILE console ===', ...consoleLog['xss-mobile'],
  '',
  '=== XSS DESKTOP network ===', ...network['xss-desktop'],
  '',
  '=== XSS MOBILE network ===', ...network['xss-mobile'],
].join('\n'));

console.log('\n--- XSS SUMMARY ---');
for (const [n, r] of Object.entries({ 'xss-desktop': desktop, 'xss-mobile': mobile })) {
  console.log(`${n}: errors=${r.W.errors} attemptId=${r.attemptId ?? '-'}`);
  for (const c of r.W.checks) console.log(`  ${c}`);
}
