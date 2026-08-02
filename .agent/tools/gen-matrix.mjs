#!/usr/bin/env node
/**
 * gen-matrix.mjs — regenerate .agent/evidence/R2-VISUAL/matrix.csv from
 * references/xoamutoeic/manifests/manifest.json.
 *
 * Usage: node .agent/tools/gen-matrix.mjs
 *
 * R2-VISUAL canonical 35-row matrix. Only reference_id, kind, viewport, route,
 * reference_render and the 3 documented exception rationales are filled from
 * the manifest; all execution columns are left 'pending' for later runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const manifestPath = path.join(repo, 'references/xoamutoeic/manifests/manifest.json');
const outPath = path.join(repo, '.agent/evidence/R2-VISUAL/matrix.csv');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// States whose manifest description is an overlay/dialog, not a page render.
const MODAL = new Set([
  'desktop/03-exam-start-mode-modal',
  'desktop/16-exam-lr-result-table',
  'desktop/17-exam-lr-error-map',
  'desktop/18-exam-lr-review-detail',
]);

// Documented S0 exceptions (summary.s0_close_final.unavailable_breakdown).
const EXCEPTION = new Set([
  'desktop/10-exam-lr-reading-bilingual-marked',
  'desktop/11-exam-lr-annotation-tools',
  'desktop/14-exam-lr-submit-confirm',
]);
const RATIONALE_KEY = {
  'desktop/10-exam-lr-reading-bilingual-marked': 'live_drift_bilingual',
  'desktop/11-exam-lr-annotation-tools': 'live_drift_annotation',
  'desktop/14-exam-lr-submit-confirm': 'historical_exception_direct_result',
};

const HEADERS = [
  'reference_id', 'kind', 'viewport', 'route', 'precondition',
  'actual_screenshot', 'reference_render', 'diff_png', 'overlay_png', 'metric',
  'console_receipt', 'network_receipt', 'impl_status', 'visual_status',
  'reviewer', 'exception_rationale', 'final_verdict',
];

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = manifest.states.map((s) => {
  let kind;
  if (EXCEPTION.has(s.id)) kind = 'exception';
  else if (MODAL.has(s.id)) kind = 'modal';
  else if (s.viewport === 'mobile') kind = 'mobile';
  else kind = 'page';

  const rationale = EXCEPTION.has(s.id)
    ? manifest.summary.s0_close_final.unavailable_breakdown[RATIONALE_KEY[s.id]]
    : 'pending';

  return [
    s.id, kind, s.viewport, s.url ?? '', '',          // reference_id..precondition
    'pending', s.source_screenshot, 'pending', 'pending', 'pending', // actual_screenshot..metric
    'pending', 'pending', 'pending', 'pending',       // console..visual_status
    'pending', rationale, 'pending',                  // reviewer, exception_rationale, final_verdict
  ];
});

const csv = [HEADERS, ...rows].map((r) => r.map(csvField).join(',')).join('\n') + '\n';
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, csv);
process.stdout.write(`wrote ${rows.length} rows -> ${outPath}\n`);
