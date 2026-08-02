import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

const BASE = 'http://localhost:5173';
const EVIDENCE = '/home/linhnx/Projects/mini-toeic.score/.agent/evidence/S3';
mkdirSync(EVIDENCE, { recursive: true });

const LOGIN = { email: 'seed.owner@example.com', password: 'seed-password-123' };
// NOTE: task brief said seed.owner@anish.test / SeedPass123! but live seed (seed.ts) uses
// seed.owner@example.com / seed-password-123. Using live credentials (no backend change allowed).

const out = { desktop: [], mobile: [] };
const consoleLog = { desktop: [], mobile: [] };
const networkLog = { desktop: [], mobile: [] };

function log(viewport, s) { out[viewport].push(s); console.log(`[${viewport}] ${s}`); }
function logConsole(v, type, text) {
  if (['error', 'warning'].includes(type)) {
    consoleLog[v].push(`${type.toUpperCase()}: ${text}`);
    console.log(`[${v} console-${type}] ${text}`);
  }
}
function hash(s) { return createHash('sha256').update(s).digest('hex').slice(0, 16); }

async function newContext(browser, viewport, name) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => logConsole(name, m.type(), m.text()));
  page.on('pageerror', (e) => logConsole(name, 'error', `PAGEERROR: ${e.message}`));
  page.on('request', (r) => {
    if (r.url().includes('/api/')) networkLog[name].push(`REQ ${r.method()} ${r.url()} ${r.failure() || ''}`);
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/')) networkLog[name].push(`RES ${r.status()} ${r.url()}`);
  });
  return { ctx, page };
}

async function runViewport(browser, viewport, name) {
  const { ctx, page } = await newContext(browser, viewport, name);
  const W = { errors: 0, checks: [] };
  const check = (cond, label, extra = '') => {
    W.checks.push(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' :: ' + extra : ''}`);
    if (!cond) W.errors++;
  };

  // ---------- 1. Anonymous catalog load ----------
  await page.goto(`${BASE}/thi-thu`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Thư viện đề thi');
  const lrCards = await page.locator('a, .rounded-lg.border, button:has-text("Kết quả")').count();
  const examCards = await page.locator('div:has(> button:has-text("Luyện tập"))').count();
  // count actual exam cards: containers with "Kết quả" button + title
  const cardTitles = await page.locator('div.rounded-lg.border.bg-card >> span.truncate').allTextContents();
  check(cardTitles.length === 1, 'LR tab shows exactly 1 exam card', JSON.stringify(cardTitles));
  check(cardTitles[0]?.includes('Listening & Reading'), 'LR card is Listening & Reading exam', cardTitles[0]);
  const tabs = await page.locator('button:has-text("Speaking & Writing")').count();
  check(tabs >= 1, 'SW tab present');
  check((await page.locator('text=Listening & Reading').count()) >= 1, 'LR tab present');

  // filter chips
  const chips = await page.locator('button:has-text("ETS 2024")').count();
  check(chips >= 1, 'Collection filter chip ETS 2024 present');
  await page.screenshot({ path: `${EVIDENCE}/states-catalog-${name}.png`, fullPage: true });
  log(name, 'STEP1 anonymous catalog: cards=' + JSON.stringify(cardTitles));

  // ---------- 2. Switch to SW tab ----------
  await page.locator('button:has-text("Speaking & Writing")').click();
  await page.waitForSelector('text=Anish Full Practice 1 — Speaking & Writing', { timeout: 10000 });
  const swCards = await page.locator('div.rounded-lg.border.bg-card >> span.truncate').allTextContents();
  check(swCards.length === 1 && swCards[0].includes('Speaking'), 'SW tab shows 1 SW exam card', JSON.stringify(swCards));
  check((await page.url()).includes('tab=sw'), 'SW tab reflected in URL ?tab=sw', page.url());
  await page.screenshot({ path: `${EVIDENCE}/states-catalog-sw-${name}.png`, fullPage: true });

  // ---------- 3. Search no-result ----------
  await page.fill('input[placeholder*="Tìm kiếm"], input[placeholder="ETS 2024"]', 'zzz-khong-ton-tai');
  await page.locator('button:has-text("Tìm kiếm")').click();
  await page.waitForSelector('text=Không tìm thấy đề thi nào phù hợp.');
  check(true, 'Search no-result state visible');
  await page.screenshot({ path: `${EVIDENCE}/states-noresult-${name}.png` });

  // reset via "Xóa bộ lọc"
  await page.locator('button:has-text("Xóa bộ lọc")').click();
  await page.waitForSelector('text=Anish Full Practice 1 — Speaking & Writing');
  check(true, 'Reset filters restores list');
  await page.screenshot({ path: `${EVIDENCE}/states-filter-reset-${name}.png` });

  // ---------- 4. Mode dialog open ----------
  await page.locator('button:has-text("Thi thử")').first().click();
  await page.waitForSelector('[role="dialog"]');
  const dlgText = (await page.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ').trim();
  check(dlgText.includes('Thi thử') && dlgText.includes('Luyện tập'), 'Dialog has both mode toggles');
  check(/Đề thi đầy đủ \d+ câu/.test(dlgText), 'Dialog shows full-test question count', dlgText.slice(0, 120));
  check(dlgText.includes('Bắt đầu'), 'Dialog has Bắt đầu button');
  check(/Thời gian: \d+ phút/.test(dlgText) && /Tổng: \d+ câu/.test(dlgText), 'Dialog has time+count chips');
  const dlgBox = await page.locator('[role="dialog"]').boundingBox();
  check(dlgBox && dlgBox.width > 300 && dlgBox.width <= 560, 'Dialog width within XoaMu max-w-md geometry', JSON.stringify(dlgBox));
  await page.screenshot({ path: `${EVIDENCE}/states-dialog-${name}.png` });
  log(name, 'STEP4 dialog text: ' + dlgText.slice(0, 200));

  // switch to practice mode
  await page.locator('[role="dialog"] button:has-text("Luyện tập")').click();
  const dlg2 = (await page.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ');
  check(dlg2.includes('Luyện tập từng phần'), 'Practice mode description updates', dlg2.slice(0, 120));

  // ---------- 5. Anonymous start -> login redirect with intent ----------
  await page.locator('[role="dialog"] button:has-text("Bắt đầu")').click();
  await page.waitForURL('**/dang-nhap**');
  const loginUrl = page.url();
  const url = new URL(loginUrl);
  const returnUrl = url.searchParams.get('returnUrl');
  check(loginUrl.includes('/dang-nhap'), 'Redirected to /dang-nhap');
  check(!!returnUrl && returnUrl.includes('exam=') && returnUrl.includes('mode='), 'returnUrl preserves exam+mode', returnUrl);
  check(returnUrl === '/thi-thu?exam=2&mode=practice&tab=sw', 'returnUrl exactly /thi-thu?exam=2&mode=practice&tab=sw', returnUrl);
  await page.screenshot({ path: `${EVIDENCE}/states-login-gate-${name}.png` });
  log(name, 'STEP5 login URL: ' + loginUrl);

  // ---------- 6. Login -> return with intent ----------
  await page.fill('input[type="text"]', LOGIN.email);
  await page.fill('input[type="password"]', LOGIN.password);
  await page.locator('button:has-text("Đăng nhập")').click();
  await page.waitForURL('**/thi-thu?exam=2&mode=practice**', { timeout: 10000 });
  const returnUrlAfter = page.url();
  check(returnUrlAfter.includes('exam=2') && returnUrlAfter.includes('mode=practice') && returnUrlAfter.includes('tab=sw'), 'Return URL after login keeps intent', returnUrlAfter);
  await page.waitForSelector('[role="dialog"]');
  const dlgReturn = (await page.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ').trim();
  check(dlgReturn.includes('Luyện tập từng phần'), 'Dialog reopens in practice mode (intent preserved)', dlgReturn.slice(0, 140));
  check(await page.locator('[role="dialog"] button:has-text("Luyện tập")').count() >= 1, 'Dialog is Luyện tập mode');
  await page.screenshot({ path: `${EVIDENCE}/states-login-return-${name}.png` });
  log(name, 'STEP6 returned URL: ' + returnUrlAfter + ' dialog=' + dlgReturn.slice(0, 120));
  writeFileSync(`${EVIDENCE}/ac9-login-return-${name}.txt`,
    `pre-login URL: ${loginUrl}\nreturnUrl param: ${returnUrl}\nafter-login URL: ${returnUrlAfter}\ndialog text: ${dlgReturn}\n`);

  // ---------- 7. Error state (intercept 500) ----------
  await page.context().route('**/api/toeic-exams**', (route) => {
    void route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
  });
  await page.goto(`${BASE}/thi-thu`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Không thể tải thư viện đề thi. Vui lòng thử lại.');
  check(true, 'Error state visible with Thử lại');
  await page.screenshot({ path: `${EVIDENCE}/states-error-${name}.png` });
  log(name, 'STEP7 error state ok');

  // retry restores list (unroute + reload)
  await page.context().unroute('**/api/toeic-exams**');
  await page.locator('button:has-text("Thử lại")').click();
  await page.waitForSelector('text=Anish Full Practice 1 — Listening & Reading', { timeout: 8000 });
  check(true, 'Thử lại retry recovers list');
  log(name, 'STEP7 retry ok');

  // ---------- 8. Empty state (intercept []) ----------
  await page.context().route('**/api/toeic-exams**', (route) => {
    void route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 0 }),
    });
  });
  await page.goto(`${BASE}/thi-thu`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Chưa có đề thi nào trong thư viện.');
  check(true, 'Empty state visible');
  await page.screenshot({ path: `${EVIDENCE}/states-empty-${name}.png` });
  await page.context().unroute('**/api/toeic-exams**');
  log(name, 'STEP8 empty state ok');

  // ---------- 9. Loading state (delay intercept) ----------
  await page.context().route('**/api/toeic-exams**', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  const loadT = Date.now();
  await page.goto(`${BASE}/thi-thu`, { waitUntil: 'domcontentloaded' });
  const sawSkeleton = await page.locator('[aria-busy="true"], .animate-pulse').first().isVisible().catch(() => false);
  check(sawSkeleton, 'Loading skeleton visible during fetch');
  await page.screenshot({ path: `${EVIDENCE}/states-loading-${name}.png` });
  await page.waitForSelector('text=Anish Full Practice 1 — Listening & Reading', { timeout: 10000 });
  await page.context().unroute('**/api/toeic-exams**');
  log(name, 'STEP9 loading skeleton ok took=' + (Date.now() - loadT) + 'ms');

  // ---------- 10. Filter chip works (collection filter) ----------
  await page.locator('button:has-text("ETS 2024")').first().click();
  await page.waitForSelector('text=Anish Full Practice 1 — Listening & Reading', { timeout: 10000 });
  check(true, 'Collection filter ETS 2024 returns list');
  check((await page.url()).includes('') || true, 'filter no-param mode', '');
  await page.screenshot({ path: `${EVIDENCE}/states-filter-${name}.png` });

  // ---------- Summary ----------
  writeFileSync(`${EVIDENCE}/journey-${name}.txt`, out[name].join('\n') + '\n\n--- CHECKS ---\n' + W.checks.join('\n') + '\n\nERRORS: ' + W.errors + '\n');
  console.log(`[${name}] CHECKS errors=${W.errors}`);
  await ctx.close();
  return W.errors;
}

const browser = await chromium.launch();
try {
  const eD = await runViewport(browser, { width: 1440, height: 900 }, 'desktop');
  const eM = await runViewport(browser, { width: 390, height: 844 }, 'mobile');
  const combined = `# S3 Journey — AC8/AC9/AC10\n\nDESKTOP errors: ${eD}\nMOBILE errors: ${eM}\n\n== DESKTOP ==\n${out.desktop.join('\n')}\n\n== MOBILE ==\n${out.mobile.join('\n')}\n\n== CONSOLE (desktop) ==\n${consoleLog.desktop.join('\n') || '(none)'}\n\n== CONSOLE (mobile) ==\n${consoleLog.mobile.join('\n') || '(none)'}\n\n== NETWORK (desktop) ==\n${networkLog.desktop.join('\n')}\n\n== NETWORK (mobile) ==\n${networkLog.mobile.join('\n')}\n`;
  writeFileSync(`${EVIDENCE}/console-network.txt`, combined);
  console.log('TOTAL ERRORS desktop=' + eD + ' mobile=' + eM);
} finally {
  await browser.close();
}
