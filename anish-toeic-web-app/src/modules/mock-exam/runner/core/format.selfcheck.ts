// Self-check for the pure L&R formatting helpers. No runtime imports, so it
// also runs under plain Node type stripping:
//   node --experimental-strip-types src/modules/mock-exam/runner/core/format.selfcheck.ts
// (Node >= 24 strips types by default; pass the flag on older versions.)
import { formatTime, splitStem, splitOptionTranslation } from './format.ts';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`format self-check failed: ${label}`);
}

assert(formatTime(0) === '00:00:00', 'formatTime zero');
assert(formatTime(3600) === '01:00:00', 'formatTime one hour');
assert(formatTime(4523) === '01:15:23', 'formatTime 1h15m23s');
assert(formatTime(59) === '00:00:59', 'formatTime 59s');

assert(splitStem('No translation').main === 'No translation', 'stem main unchanged');
assert(splitStem('No translation').translation === null, 'stem without translation');
const stem = splitStem('The lecture will take place.\n\u2192 B\u00e0i gi\u1ea3ng s\u1ebd di\u1ec5n ra.');
assert(stem.main === 'The lecture will take place.', 'stem main split');
assert(stem.translation === 'B\u00e0i gi\u1ea3ng s\u1ebd di\u1ec5n ra.', 'stem translation split');
assert(splitStem('first\nsecond').translation === null, 'stem keeps plain second line');

const option = splitOptionTranslation('last \u2192 cu\u1ed1i c\u00f9ng');
assert(option.main === 'last', 'option main split');
assert(option.translation === 'cu\u1ed1i c\u00f9ng', 'option translation split');
assert(splitOptionTranslation('plain text').translation === null, 'option without translation');

console.log('format self-check: 12 assertions passed');
