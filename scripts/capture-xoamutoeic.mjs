#!/usr/bin/env node
/**
 * S0 capture script — literal production-source references for XoaMu TOEIC.
 *
 * Method: connect to a real Chrome via Chrome DevTools Protocol (CDP),
 * drive the SPA into each reference state, then call the browser-native
 * Page.captureSnapshot({ format: 'mhtml' }) — the same "Webpage, Complete"
 * snapshot the browser produces. No wget, no outerHTML, no DOM mutation,
 * no requests library; everything goes through Chrome itself.
 *
 * Every state is self-contained (fresh navigation + full setup), so a
 * transient failure only blocks that one state and is retried once.
 *
 * Prerequisites:
 *   1. Chrome launched with remote debugging:
 *      chrome --remote-debugging-port=9222 --user-data-dir=<temp-profile>
 *      --use-fake-device-for-media-stream --use-fake-ui-for-media-stream
 *   2. playwright-core resolvable (set PLAYWRIGHT_CORE if needed).
 *
 * Usage:
 *   node scripts/capture-xoamutoeic.mjs
 *   node scripts/capture-xoamutoeic.mjs --only desktop/09-exam-lr-reading-part5-question101
 *   $env:CDP_ENDPOINT="http://127.0.0.1:9222"
 *
 * Output:
 *   references/xoamutoeic/production-source/desktop|mobile/*.mhtml
 *   references/xoamutoeic/manifests/manifest.json
 */

import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ROOT = path.resolve(import.meta.dirname, '..');
const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const BASE_URL = process.env.BASE_URL || 'https://www.xoamutoeic.com';
const OUT_DIR = path.join(ROOT, 'references', 'xoamutoeic', 'production-source');
const MANIFEST_DIR = path.join(ROOT, 'references', 'xoamutoeic', 'manifests');
const MANIFEST_PATH = path.join(MANIFEST_DIR, 'manifest.json');
const RETRY = process.env.CAPTURE_RETRY ? parseInt(process.env.CAPTURE_RETRY, 10) : 1;

const VIEWPORTS = {
  desktop: { width: 1280, height: 720, dsf: 1 },
  mobile: { width: 390, height: 844, dsf: 3 },
};

async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    'C:/Users/ADMIN/AppData/Local/Temp/opencode/pw/node_modules/playwright-core/index.mjs',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return await import(pathToFileURL(c).href);
    } catch { /* next */ }
  }
  try {
    return await import('playwright-core');
  } catch {
    throw new Error('playwright-core not found. Install it or set PLAYWRIGHT_CORE to its index.mjs path.');
  }
}

// ---------------------------------------------------------------------------
// Reusable setup sequences (full path to each state, run on a fresh page)
// ---------------------------------------------------------------------------
const W = (ms) => ({ type: 'wait', ms });
const C = (text, force) => ({ type: 'clickText', text, force: !!force });
const CA = (aria, force) => ({ type: 'clickAria', aria, force: !!force });
const CTA = (texts, force) => ({ type: 'clickTextAny', texts, force: !!force });
const P = (key) => ({ type: 'press', key });

const LR_EXAM = `${BASE_URL}/exams/ets-2026-test-1-mq1tovav`;
const SW_EXAM = `${BASE_URL}/speaking-writing/Test1`;
const W_EXAM = `${BASE_URL}/writing/Test1`;

// L&R runner: reach Listening Part 1 Q1.
const LR_TO_Q1 = [C('Start test'), W(3500), C('NEXT'), W(3000), C('NEXT'), W(4000)];
// Reading Q101 (skip listening).
const LR_TO_READING = [...LR_TO_Q1, C('Sang Reading'), W(5000)];
// Reading Q101 with answer (A) marked + bilingual on (site-dependent; may be blocked).
const LR_Q101_MARKED_BI = [...LR_TO_READING, { type: 'clickRadio', nth: 0 }, W(800), CTA(['Song ngữ', 'Ẩn song ngữ'], true), W(2500)];
// Reading Q102 with annotation toolbar open.
const LR_Q102_TOOLS = [...LR_TO_READING, C('Câu tiếp'), W(2000), C('Công cụ'), W(2500)];
// Clean Reading Q131 (via palette).
const LR_Q131 = [...LR_TO_READING, CA('Mở bảng câu hỏi'), W(2000), C('131', true), W(3500), P('Escape'), W(1200)];
// Clean Reading Q147.
const LR_Q147 = [...LR_TO_READING, CA('Mở bảng câu hỏi'), W(2000), C('147', true), W(3500), P('Escape'), W(1200)];
// L&R result certificate via anonymous submit.
const LR_RESULT = [...LR_TO_READING, C('Nộp bài'), W(8000)];

// Speaking runner: pass microphone test -> directions.
const SW_PASS_MIC = [C('Start test'), W(4000), CA('Record'), W(33000), C('Continue'), W(4000)];
const SW_TO_Q1 = [...SW_PASS_MIC, C('Next'), W(3500)];

// Writing runner: start writing test.
const W_STARTED = [C('BẮT ĐẦU'), W(5000)];

const NEXT_Q = (n) => {
  const acts = [];
  for (let i = 0; i < n; i++) acts.push(CA('Câu sau'), W(1500));
  acts.push(W(2500));
  return acts;
};

// ---------------------------------------------------------------------------
// State map — 1:1 with references/xoamutoeic/screenshots/{desktop,mobile}
// ---------------------------------------------------------------------------
const STATES = [
  // ------------------------- Desktop (31) --------------------------------
  {
    id: 'desktop/01-exams-sw-list-full', viewport: 'desktop',
    url: `${BASE_URL}/exams?tab=sw`,
    state: 'S&W catalog list (tab Speaking & Writing)', wait: 5000,
  },
  {
    id: 'desktop/02-exams-lr-list-full', viewport: 'desktop',
    url: `${BASE_URL}/exams?tab=lr`,
    state: 'L&R catalog list (tab Listening & Reading)', wait: 5000,
  },
  {
    id: 'desktop/03-exam-start-mode-modal', viewport: 'desktop',
    url: `${BASE_URL}/exams?tab=lr`,
    state: 'Exam mode modal (Thi thử / Luyện tập) opened on first card', wait: 5000,
    actions: [C('Thi thử', true), W(2500)],
  },
  {
    id: 'desktop/04-exam-lr-detail-start', viewport: 'desktop',
    url: LR_EXAM,
    state: 'L&R exam detail start page', wait: 5000,
  },
  {
    id: 'desktop/05-exam-lr-active-part1', viewport: 'desktop',
    url: LR_EXAM,
    state: 'Listening directions (after Start test)', wait: 4000,
    actions: [C('Start test'), W(4500)],
  },
  {
    id: 'desktop/06-exam-lr-part1-directions', viewport: 'desktop',
    url: LR_EXAM,
    state: 'Listening Part 1 — Photographs directions', wait: 4000,
    actions: [C('Start test'), W(3500), C('NEXT'), W(4000)],
  },
  {
    id: 'desktop/07-exam-lr-part1-question1', viewport: 'desktop',
    url: LR_EXAM,
    state: 'Listening Part 1 Question 1 (image + options)', wait: 4000,
    actions: LR_TO_Q1,
  },
  {
    id: 'desktop/08-exam-lr-question-palette', viewport: 'desktop',
    url: LR_EXAM,
    state: 'Listening Q1 with question palette open', wait: 4000,
    actions: [...LR_TO_Q1, CA('Mở bảng câu hỏi'), W(2500)],
  },
  {
    id: 'desktop/09-exam-lr-reading-part5-question101', viewport: 'desktop',
    url: LR_EXAM,
    state: 'Reading Part 5 Question 101 (after Sang Reading)', wait: 4000,
    actions: LR_TO_READING,
  },
  {
    id: 'desktop/10-exam-lr-reading-bilingual-marked', viewport: 'desktop',
    url: LR_EXAM,
    state: 'Reading Q101 with answer marked and bilingual (Song ngữ) on',
    wait: 4000,
    actions: [...LR_Q101_MARKED_BI, { type: 'verifyBilingual' }],
  },
  {
    id: 'desktop/11-exam-lr-annotation-tools', viewport: 'desktop',
    url: LR_EXAM,
    state: 'Reading Q102 with annotation toolbar open (Công cụ)',
    wait: 4000,
    actions: [...LR_TO_READING, C('Câu tiếp'), W(2000), C('Công cụ'), W(3000), { type: 'verifyAnnotation' }],
  },
  {
    id: 'desktop/12-exam-lr-reading-part6-question131', viewport: 'desktop',
    url: LR_EXAM,
    state: 'Reading Part 6 Question 131 (via palette, bilingual off, toolbar closed)', wait: 4000,
    actions: LR_Q131,
  },
  {
    id: 'desktop/13-exam-lr-reading-part7-question147', viewport: 'desktop',
    url: LR_EXAM,
    state: 'Reading Part 7 Question 147 (via palette)', wait: 4000,
    actions: LR_Q147,
  },
  {
    id: 'desktop/14-exam-lr-submit-confirm', viewport: 'desktop',
    blocked: 'NON-REPRODUCIBLE: no submit confirmation exists. references/README.md documents that the survey submit navigated straight to the result; current site does the same.',
  },
  {
    id: 'desktop/15-exam-lr-result-certificate', viewport: 'desktop',
    url: LR_EXAM,
    state: 'L&R unofficial score certificate (0-score anonymous submit)', wait: 4000,
    actions: LR_RESULT,
  },
  {
    id: 'desktop/16-exam-lr-result-table', viewport: 'desktop',
    url: LR_EXAM,
    state: 'L&R score table modal (Bảng kết quả)', wait: 4000,
    actions: [...LR_RESULT, CTA(['📊 Bảng kết quả', 'Bảng kết quả'], true), W(2500)],
  },
  {
    id: 'desktop/17-exam-lr-error-map', viewport: 'desktop',
    url: LR_EXAM,
    state: 'L&R error map modal (Bản đồ lỗi sai)', wait: 4000,
    actions: [...LR_RESULT, CTA(['🧭 Bản đồ lỗi sai', 'Bản đồ lỗi sai'], true), W(2500)],
  },
  {
    id: 'desktop/18-exam-lr-review-detail', viewport: 'desktop',
    url: LR_EXAM,
    state: 'L&R per-question review modal (Xem lại chi tiết)', wait: 4000,
    actions: [...LR_RESULT, CTA(['🔍 Xem lại chi tiết', 'Xem lại chi tiết'], true), W(2500)],
  },
  {
    id: 'desktop/19-history-auth-gate', viewport: 'desktop',
    url: `${BASE_URL}/history`,
    state: 'History redirect to auth gate (/history -> /auth)', wait: 6000,
  },
  {
    id: 'desktop/20-exam-sw-detail-start', viewport: 'desktop',
    url: SW_EXAM,
    state: 'S&W exam detail start page', wait: 5000,
  },
  {
    id: 'desktop/21-exam-sw-speaking-part1-intro', viewport: 'desktop',
    url: SW_EXAM,
    state: 'Speaking RECORD TEST (microphone test screen)', wait: 4000,
    actions: [C('Start test'), W(4500)],
  },
  {
    id: 'desktop/22-exam-sw-speaking-directions', viewport: 'desktop',
    url: SW_EXAM,
    state: 'Speaking directions (Questions 1-2 read aloud), after passing mic test', wait: 4000,
    actions: SW_PASS_MIC,
  },
  {
    id: 'desktop/23-exam-sw-speaking-q1-preparation', viewport: 'desktop',
    url: SW_EXAM,
    state: 'Speaking Q1 preparation (READ ALOUD, 45s prep)', wait: 4000,
    actions: SW_TO_Q1,
  },
  {
    id: 'desktop/24-exam-sw-speaking-q3-describe-picture', viewport: 'desktop',
    url: SW_EXAM,
    state: 'Speaking Q3 describe picture', wait: 4000,
    actions: [...SW_TO_Q1, ...NEXT_Q(2)],
  },
  {
    id: 'desktop/25-exam-sw-speaking-q5-respond', viewport: 'desktop',
    url: SW_EXAM,
    state: 'Speaking Q5 respond to questions', wait: 4000,
    actions: [...SW_TO_Q1, ...NEXT_Q(4)],
  },
  {
    id: 'desktop/26-exam-sw-speaking-q8-information', viewport: 'desktop',
    url: SW_EXAM,
    state: 'Speaking Q8 respond using information', wait: 4000,
    actions: [...SW_TO_Q1, ...NEXT_Q(7)],
  },
  {
    id: 'desktop/27-exam-sw-writing-start', viewport: 'desktop',
    url: W_EXAM,
    state: 'Writing test directions (start page)', wait: 5000,
  },
  {
    id: 'desktop/28-exam-sw-writing-q1-picture', viewport: 'desktop',
    url: W_EXAM,
    state: 'Writing Q1 write sentence about picture', wait: 4000,
    actions: W_STARTED,
  },
  {
    id: 'desktop/29-exam-sw-writing-q6-email', viewport: 'desktop',
    url: W_EXAM,
    state: 'Writing Q6 respond to email', wait: 4000,
    actions: [...W_STARTED, ...NEXT_Q(5)],
  },
  {
    id: 'desktop/30-exam-sw-writing-q8-essay', viewport: 'desktop',
    url: W_EXAM,
    state: 'Writing Q8 opinion essay', wait: 4000,
    actions: [...W_STARTED, ...NEXT_Q(7)],
  },
  {
    id: 'desktop/31-exam-sw-ai-processing', viewport: 'desktop',
    url: `${BASE_URL}/ai-processing?type=sw`,
    state: 'AI feedback no-data state (route redirects /ai-processing -> /ai-feedback); anonymous S&W grading is Unauthorized per survey',
    wait: 6000,
  },

  // ------------------------- Mobile (4) ----------------------------------
  {
    id: 'mobile/01-exams-sw-list-full', viewport: 'mobile',
    url: `${BASE_URL}/exams?tab=sw`,
    state: 'S&W catalog list (mobile)', wait: 5000,
  },
  {
    id: 'mobile/02-exams-lr-list-full', viewport: 'mobile',
    url: `${BASE_URL}/exams?tab=lr`,
    state: 'L&R catalog list (mobile)', wait: 5000,
  },
  {
    id: 'mobile/03-exam-lr-q1', viewport: 'mobile',
    url: LR_EXAM,
    state: 'L&R runner Q1 (mobile)', wait: 4500,
    actions: LR_TO_Q1,
  },
  {
    id: 'mobile/04-exam-sw-writing-q1', viewport: 'mobile',
    url: W_EXAM,
    state: 'Writing Q1 picture (mobile)', wait: 4500,
    actions: W_STARTED,
  },
];

// ---------------------------------------------------------------------------
// Action runner
// ---------------------------------------------------------------------------
async function runActions(page, actions) {
  for (const a of actions || []) {
    switch (a.type) {
      case 'wait':
        await page.waitForTimeout(a.ms);
        break;
      case 'press':
        await page.keyboard.press(a.key);
        break;
      case 'clickText': {
        const loc = page.locator(`button:has-text("${a.text}")`).first();
        await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
        await loc.click({ timeout: 30000, force: !!a.force }).catch(async (e) => {
          if (a.force) throw e;
          await loc.click({ timeout: 30000, force: true });
        });
        break;
      }
      case 'clickTextAny': {
        let clicked = false;
        let lastErr = null;
        for (const t of a.texts) {
          const loc = page.locator(`button:has-text("${t}")`).first();
          if (await loc.count()) {
            try {
              await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
              await loc.click({ timeout: 15000, force: !!a.force }).catch(async (e) => {
                if (a.force) throw e;
                await loc.click({ timeout: 15000, force: true });
              });
              clicked = true;
              break;
            } catch (e) { lastErr = e; }
          }
        }
        if (!clicked) throw new Error(`clickTextAny: none matched ${a.texts.join('|')}${lastErr ? ` (${String(lastErr.message).split('\n')[0]})` : ''}`);
        break;
      }
      case 'clickAria': {
        const loc = page.locator(`[aria-label="${a.aria}"]`).first();
        await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
        await loc.click({ timeout: 30000, force: !!a.force }).catch(async (e) => {
          if (a.force) throw e;
          await loc.click({ timeout: 30000, force: true });
        });
        break;
      }
      case 'clickRadio': {
        const loc = page.locator('input[type="radio"]').nth(a.nth || 0);
        await loc.check({ force: true, timeout: 15000 });
        break;
      }
      case 'verifyBilingual': {
        await page.waitForTimeout(3000);
        const ok = await page.evaluate(() => {
          const bodyTxt = document.body.textContent.replace(/\s+/g, ' ');
          if (!bodyTxt.includes('Ẩn song ngữ')) return { ok: false, reason: 'bilingual did not activate (header still shows "Song ngữ")' };
          const overlay = [...document.querySelectorAll('[class*="fixed inset-0"]')].find((el) => el.className.includes('z-50'));
          if (overlay && overlay.textContent.trim().length < 50) {
            return { ok: false, reason: 'empty fullscreen overlay opened instead of inline bilingual (site defect)' };
          }
          return { ok: true };
        });
        if (!ok.ok) throw new Error(`verifyBilingual: ${ok.reason}`);
        break;
      }
      case 'verifyAnnotation': {
        await page.waitForTimeout(2000);
        const ok = await page.evaluate(() => {
          const bodyTxt = document.body.textContent.replace(/\s+/g, ' ');
          const hasTools = bodyTxt.includes('Browse Mode') || bodyTxt.includes('Draw Mode') || bodyTxt.includes('Xoá hết');
          if (!hasTools) return { ok: false, reason: 'annotation toolbar did not render (empty dialog - site defect)' };
          return { ok: true };
        });
        if (!ok.ok) throw new Error(`verifyAnnotation: ${ok.reason}`);
        break;
      }
      default:
        throw new Error(`unknown action type: ${a.type}`);
    }
  }
}

async function captureSnapshot(cdp) {
  const res = await cdp.send('Page.captureSnapshot', { format: 'mhtml' });
  const data = res.data;
  if (!data || !String(data).startsWith('From: <Saved by Blink>')) {
    throw new Error('captureSnapshot returned unexpected payload (not MHTML)');
  }
  return String(data);
}

async function setViewport(cdp, kind) {
  const v = VIEWPORTS[kind];
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: v.width, height: v.height, deviceScaleFactor: v.dsf, mobile: kind === 'mobile',
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: kind === 'mobile' });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const only = [];
const skip = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--only') only.push(...args[++i].split(','));
  if (args[i] === '--skip') skip.push(...args[++i].split(','));
}

const pw = await loadPlaywright();
const browser = await pw.chromium.connectOverCDP(CDP_ENDPOINT);
const context = browser.contexts()[0];
const page = context.pages()[0] || (await context.newPage());
const cdp = await context.newCDPSession(page);
await page.bringToFront().catch(() => {});

const results = [];

for (const st of STATES) {
  if (only.length && !only.includes(st.id)) continue;
  if (skip.includes(st.id)) { results.push({ id: st.id, status: 'skipped' }); continue; }

  const rec = {
    id: st.id, viewport: st.viewport, state: st.state || '', status: 'pending',
    url: st.url || null, file: null, sha256: null, size: 0, blocker: null, captured_at: null,
  };

  if (st.blocked) {
    rec.status = 'blocked';
    rec.blocker = st.blocked;
    // Remove any stale MHTML from a previous run so it is not mistaken for a valid capture.
    const relDir = st.viewport === 'mobile' ? 'mobile' : 'desktop';
    const stale = path.join(OUT_DIR, relDir, `${st.id.split('/')[1]}.mhtml`);
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
    results.push(rec);
    console.log(JSON.stringify({ id: rec.id, status: rec.status, blocker: rec.blocker }));
    continue;
  }

  for (let attempt = 0; attempt <= RETRY; attempt++) {
    try {
      await setViewport(cdp, st.viewport);
      await page.goto(st.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(st.wait || 4000);
      await runActions(page, st.actions || []);

      const mhtml = await captureSnapshot(cdp);
      const relDir = st.viewport === 'mobile' ? 'mobile' : 'desktop';
      const relPath = path.posix.join(relDir, `${st.id.split('/')[1]}.mhtml`);
      const absPath = path.join(OUT_DIR, relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, mhtml, 'utf8');

      const buf = fs.readFileSync(absPath);
      rec.status = 'captured';
      rec.file = relPath;
      rec.sha256 = createHash('sha256').update(buf).digest('hex');
      rec.size = buf.length;
      rec.captured_at = new Date().toISOString();
      rec.url = page.url();
      rec.retries = attempt;
      break;
    } catch (err) {
      if (attempt < RETRY) continue;
      rec.status = 'blocked';
      rec.blocker = `Capture error (attempts=${attempt + 1}): ${String(err.message || err).split('\n')[0]}`;
      const relDir = st.viewport === 'mobile' ? 'mobile' : 'desktop';
      const stale = path.join(OUT_DIR, relDir, `${st.id.split('/')[1]}.mhtml`);
      if (fs.existsSync(stale)) fs.unlinkSync(stale);
    }
  }

  results.push(rec);
  console.log(JSON.stringify({ id: rec.id, status: rec.status, blocker: rec.blocker, retries: rec.retries ?? 0 }));
}

await browser.close();

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
const captured = results.filter((r) => r.status === 'captured');
const blocked = results.filter((r) => r.status === 'blocked');
const manifest = {
  schema_version: 1,
  slice: 'S0',
  task: 'anish-thi-thu-full-xoamutoeic',
  target: BASE_URL,
  captured_at: new Date().toISOString(),
  capture_method: 'Playwright connectOverCDP + Page.captureSnapshot({format:"mhtml"}) in real Chrome; no wget/outerHTML/DOM mutation',
  capture_notes: [
    'Authenticated result/history states not captured: owner-provided signed-in session required per plan AC1 note.',
    'Desktop/14 submit-confirm is non-reproducible: no confirm dialog exists (references/README.md).',
    'Desktop/31: /ai-processing?type=sw now redirects to /ai-feedback?type=sw (anonymous no-data state); survey captured anonymous Unauthorized at 5%.',
    'Speaking states 22-26 use Chrome launch flag --use-fake-device-for-media-stream so the required microphone test can complete without a physical device.',
    'States 15-18 and result modals require an anonymous L&R submit, which creates a zero-score attempt record on the production site (same process the survey used).',
  ],
  viewports: {
    desktop: '1280x720',
    mobile: '390x844 (deviceScaleFactor 3)',
  },
  states: results.map((r) => ({
    id: r.id,
    status: r.status,
    source_screenshot: `references/xoamutoeic/screenshots/${r.viewport}/${r.id.split('/')[1]}.png`,
    state: r.state,
    url: r.url,
    viewport: r.viewport,
    file: r.file,
    sha256: r.sha256,
    size_bytes: r.size,
    blocker: r.blocker,
    captured_at: r.captured_at,
    retries: r.retries,
  })),
  summary: {
    total: results.length,
    captured: captured.length,
    blocked: blocked.length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  },
};

fs.mkdirSync(MANIFEST_DIR, { recursive: true });
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`SUMMARY total=${manifest.summary.total} captured=${manifest.summary.captured} blocked=${manifest.summary.blocked}`);
console.log(`MANIFEST ${MANIFEST_PATH}`);
