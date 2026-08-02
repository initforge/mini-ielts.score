#!/usr/bin/env node
/**
 * run-visual-R2.mjs — R2-VISUAL driver: runs visual-diff.mjs for all 35 S0 refs.
 * Mapping refid -> actual png derived from R2-LR/R2-SW screenshot-manifests.
 * Usage: node .agent/tools/run-visual-R2.mjs
 * Writes states/<refid-with-dash>/ + matrix.csv rows + run-summary.txt (matrix/summary written separately by sibling logic in this file).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve('.');
const LR = path.join(ROOT, '.agent/evidence/R2-LR');
const SW = path.join(ROOT, '.agent/evidence/R2-SW');
const OUT = path.join(ROOT, '.agent/evidence/R2-VISUAL');
const TOOL = path.join(ROOT, '.agent/tools/visual-diff.mjs');
const REFDESK = path.join(ROOT, 'references/xoamutoeic/screenshots/desktop');
const REFMOB = path.join(ROOT, 'references/xoamutoeic/screenshots/mobile');

// refid -> { actual, src }  (src = LR|SW for console receipt lookup)
const MAP = {
  'desktop/01-exams-sw-list-full':              { a: 'desktop01-catalog-sw.png', s: 'LR' },
  'desktop/02-exams-lr-list-full':              { a: 'desktop02-catalog-lr.png', s: 'LR' },
  'desktop/03-exam-start-mode-modal':           { a: 'desktop03-mode-dialog.png', s: 'LR' },
  'desktop/04-exam-lr-detail-start':            { a: 'desktop04-exam-detail.png', s: 'LR' },
  'desktop/05-exam-lr-active-part1':            { a: 'desktop05-listening-directions.png', s: 'LR' },
  'desktop/06-exam-lr-part1-directions':        { a: 'desktop06-part1-directions.png', s: 'LR' },
  'desktop/07-exam-lr-part1-question1':         { a: 'desktop07-part1-q1.png', s: 'LR' },
  'desktop/08-exam-lr-question-palette':        { a: 'desktop08-palette-answered.png', s: 'LR' },
  'desktop/09-exam-lr-reading-part5-question101': { a: 'desktop09-part5.png', s: 'LR' },
  'desktop/10-exam-lr-reading-bilingual-marked':  { a: 'desktop10-bilingual-on.png', s: 'LR' },
  'desktop/11-exam-lr-annotation-tools':        { a: 'desktop11-annotation-toolbar.png', s: 'LR' },
  'desktop/12-exam-lr-reading-part6-question131': { a: 'desktop12-part6.png', s: 'LR' },
  'desktop/13-exam-lr-reading-part7-question147': { a: 'desktop13-part7.png', s: 'LR' },
  'desktop/14-exam-lr-submit-confirm':          { a: 'desktop14-submit-confirm.png', s: 'LR' },
  'desktop/15-exam-lr-result-certificate':      { a: 'desktop15-result.png', s: 'LR' },
  'desktop/16-exam-lr-result-table':            { a: 'desktop16-score-table-modal.png', s: 'LR' },
  'desktop/17-exam-lr-error-map':               { a: 'desktop17-error-map.png', s: 'LR' },
  'desktop/18-exam-lr-review-detail':           { a: 'desktop18-review-detail.png', s: 'LR' },
  'desktop/19-history-auth-gate':               { a: 'desktop19-history.png', s: 'LR' },
  'desktop/20-exam-sw-detail-start':            { a: 'desktop20-exam-sw-detail.png', s: 'SW' },
  'desktop/21-exam-sw-speaking-part1-intro':    { a: 'desktop21-exam-sw-mic-setup.png', s: 'SW' },
  'desktop/22-exam-sw-speaking-directions':     { a: 'desktop22-exam-sw-speaking-directions.png', s: 'SW' },
  'desktop/23-exam-sw-speaking-q1-preparation': { a: 'desktop23-exam-sw-speaking-q1-prep.png', s: 'SW' },
  'desktop/24-exam-sw-speaking-q3-describe-picture': { a: 'desktop24-exam-sw-speaking-q3-image.png', s: 'SW' },
  'desktop/25-exam-sw-speaking-q5-respond':     { a: 'desktop25-exam-sw-speaking-q5.png', s: 'SW' },
  'desktop/26-exam-sw-speaking-q8-information': { a: 'desktop26-exam-sw-speaking-q8.png', s: 'SW' },
  'desktop/27-exam-sw-writing-start':           { a: 'desktop27-exam-sw-writing-start.png', s: 'SW' },
  'desktop/28-exam-sw-writing-q1-picture':      { a: 'desktop28-exam-sw-writing-q1.png', s: 'SW' },
  'desktop/29-exam-sw-writing-q6-email':        { a: 'desktop29-exam-sw-writing-q6-email.png', s: 'SW' },
  'desktop/30-exam-sw-writing-q8-essay':        { a: 'desktop30-exam-sw-writing-q8-essay.png', s: 'SW' },
  'desktop/31-exam-sw-ai-processing':           { a: 'desktop31-exam-sw-processing.png', s: 'SW' },
  'mobile/01-exams-sw-list-full':               { a: 'mobile01-catalog-sw.png', s: 'LR' },
  'mobile/02-exams-lr-list-full':               { a: 'mobile02-catalog-lr.png', s: 'LR' },
  'mobile/03-exam-lr-q1':                       { a: 'mobile07-part1-q1.png', s: 'LR' },
  'mobile/04-exam-sw-writing-q1':               { a: 'mobile04-exam-sw-writing-q1.png', s: 'SW' },
};

const results = [];
for (const [refid, { a, s }] of Object.entries(MAP)) {
  const reffile = refid.startsWith('mobile/') ? path.join(REFMOB, refid.split('/')[1] + '.png') : path.join(REFDESK, refid.split('/')[1] + '.png');
  const actfile = path.join(s === 'LR' ? LR : SW, a);
  if (!fs.existsSync(reffile)) throw new Error('missing ref ' + reffile);
  if (!fs.existsSync(actfile)) throw new Error('missing actual ' + actfile);
  const outdir = path.join(OUT, 'states', refid.replace(/\//g, '-'));
  const json = execFileSync('node', [TOOL, reffile, actfile, '--outdir', outdir], { encoding: 'utf8' });
  results.push({ refid, actual: a, src: s, outdir, metric: JSON.parse(json) });
}
const out = path.join(OUT, 'diffs.json');
fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n');
console.log('done', results.length, 'states ->', out);
