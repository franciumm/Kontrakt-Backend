// Coverage for the contract risk-scoring domain logic.
//
// Grounded in docs/DESIGN.md (Resolved Decisions #3 and #4):
//   - Coverage % = (sum of exposureWeight for clauses with ALL questions answered)
//                  / (sum of exposureWeight for all TRIGGERED clauses)
//   - "Triggered" means triggersWhen(answeredState) === true. The score does NOT
//     consult dependsOn — only getNextQuestions does. A clause whose trigger fires
//     but whose dependencies are unanswered still counts in the denominator.
//   - exposureWeight is a 0..10 integer per clause (spec line 93/101).
//
// Every test is a real call against the real clause data — no mocks, no
// assumptions. If a weight changes in the data files, the exact-number tests
// fail loudly here so the regression is visible.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getExposureScore, getNextQuestions } from '../../src/lib/graphWalker.js';
import { designClauses } from '../../src/data/clauses/design.clauses.js';
import { softwareClauses } from '../../src/data/clauses/software.clauses.js';

const ALL_CLAUSES = [...designClauses, ...softwareClauses];

// ============================================================================
// Data-shape invariants — spec contract on every clause node.
// ============================================================================

test('spec invariant — every exposureWeight is an integer in 0..10', () => {
  for (const c of ALL_CLAUSES) {
    assert.ok(Number.isInteger(c.exposureWeight), `${c.id}: weight not an integer (${c.exposureWeight})`);
    assert.ok(c.exposureWeight >= 0 && c.exposureWeight <= 10, `${c.id}: weight out of range (${c.exposureWeight})`);
  }
});

test('spec invariant — every clause has triggersWhen, dependsOn array, and >=1 question with a field', () => {
  for (const c of ALL_CLAUSES) {
    assert.equal(typeof c.triggersWhen, 'function', `${c.id}: triggersWhen not a function`);
    assert.ok(Array.isArray(c.dependsOn), `${c.id}: dependsOn not an array`);
    assert.ok(c.questions.length >= 1, `${c.id}: has no questions`);
    for (const q of c.questions) {
      assert.equal(typeof q.field, 'string', `${c.id}: question missing field`);
      assert.ok(q.field.length > 0, `${c.id}: empty field name`);
    }
  }
});

test('spec invariant — design total weight = 55, software total weight = 56', () => {
  // Guards against accidental weight edits. Update both the data AND this number
  // if weights are intentionally retuned.
  const sum = (arr) => arr.reduce((acc, c) => acc + c.exposureWeight, 0);
  assert.equal(sum(designClauses), 55, 'design clause weights drifted');
  assert.equal(sum(softwareClauses), 56, 'software clause weights drifted');
});

test('spec invariant — no duplicate question fields within a gig type', () => {
  for (const set of [designClauses, softwareClauses]) {
    const seen = new Set();
    for (const c of set) {
      for (const q of c.questions) {
        assert.ok(!seen.has(q.field), `duplicate field "${q.field}" in clause set`);
        seen.add(q.field);
      }
    }
  }
});

// ============================================================================
// getExposureScore — DESIGN gig type
// ============================================================================
// Design weights & triggers:
//   payment-terms     10  always
//   kill-fee           9  totalFee !== undefined
//   revision-limits    8  totalFee !== undefined
//   intellectual-property 10  totalFee !== undefined
//   usage-rights       7  retainPortfolioRights !== undefined
//   timeline-delivery  6  totalFee !== undefined
//   dispute-resolution 5  totalFee !== undefined
// ============================================================================

test('design — empty state: only always-trigger root counts, 0 covered', () => {
  const r = getExposureScore({}, 'design');
  assert.deepEqual(r, { score: 0, covered: 0, total: 10, percentage: 0 });
});

test('design — totalFee set but no questions completed: 6 clauses trigger (48), 0 covered', () => {
  // payment(10)+kill-fee(9)+revision(8)+ip(10)+timeline(6)+dispute(5) = 48
  const r = getExposureScore({ totalFee: 5000 }, 'design');
  assert.equal(r.covered, 0);
  assert.equal(r.total, 48);
  assert.equal(r.percentage, 0);
  assert.equal(r.score, 0);
});

test('design — payment-terms fully answered: 10/48 -> 21%', () => {
  const r = getExposureScore({ totalFee: 5000, netDays: 30 }, 'design');
  assert.equal(r.covered, 10);
  assert.equal(r.total, 48);
  assert.equal(r.percentage, 21);
  assert.equal(r.score, 10 / 48);
});

test('design — payment + kill-fee answered: 19/48 -> 40%', () => {
  const r = getExposureScore({ totalFee: 5000, netDays: 30, killFeePercent: 25 }, 'design');
  assert.equal(r.covered, 19);
  assert.equal(r.total, 48);
  assert.equal(r.percentage, 40);
});

test('design — partial revision-limits (1 of 2 answered) does NOT count as covered', () => {
  // Documents per-clause "ALL questions answered" gate, not per-question.
  const r = getExposureScore({ totalFee: 5000, netDays: 30, revisionRounds: 3 }, 'design');
  assert.equal(r.covered, 10); // still only payment-terms
  assert.equal(r.total, 48);
  assert.equal(r.percentage, 21);
});

test('design — retainPortfolioRights alone triggers usage-rights independently (17 total)', () => {
  // usage-rights triggers on retainPortfolioRights, NOT on totalFee. Score
  // denominator includes it even though IP (its parent) has no other context.
  const r = getExposureScore({ retainPortfolioRights: 'yes' }, 'design');
  assert.equal(r.covered, 0);
  assert.equal(r.total, 17); // 10 (payment-terms) + 7 (usage-rights)
  assert.equal(r.percentage, 0);
});

test('design — full state: 55/55 -> 100%', () => {
  const full = {
    totalFee: 5000,
    netDays: 30,
    killFeePercent: 25,
    revisionRounds: 3,
    revisionRate: 200,
    retainPortfolioRights: 'yes',
    usageScope: 'digital marketing',
    initialDays: 5,
    finalDays: 10,
    jurisdiction: 'NYC, NY',
  };
  const r = getExposureScore(full, 'design');
  assert.equal(r.covered, 55);
  assert.equal(r.total, 55);
  assert.equal(r.percentage, 100);
  assert.equal(r.score, 1);
});

test('design — falsy answer values count as answered (in-operator semantics)', () => {
  // totalFee: 0 and netDays: 0 are real answers. The walker uses `field in state`,
  // not truthiness — so 0 / false / '' all count.
  const r = getExposureScore({ totalFee: 0, netDays: 0 }, 'design');
  assert.equal(r.covered, 10);
  assert.equal(r.total, 48);
  assert.equal(r.percentage, 21);
});

// ============================================================================
// getExposureScore — SOFTWARE gig type
// ============================================================================
// Software weights & triggers:
//   payment-terms     10  always
//   kill-fee           9  totalFee !== undefined
//   scope-of-work      9  totalFee !== undefined
//   intellectual-property 10  totalFee !== undefined
//   acceptance-testing 7  projectDescription !== undefined
//   warranty-support   6  totalFee !== undefined
//   confidentiality-nda 5  totalFee !== undefined
// ============================================================================

test('software — empty state: only root triggers', () => {
  const r = getExposureScore({}, 'software');
  assert.deepEqual(r, { score: 0, covered: 0, total: 10, percentage: 0 });
});

test('software — totalFee set: 6 clauses trigger (49), acceptance-testing held out', () => {
  // payment(10)+kill-fee(9)+scope(9)+ip(10)+warranty(6)+nda(5) = 49
  const r = getExposureScore({ totalFee: 5000 }, 'software');
  assert.equal(r.covered, 0);
  assert.equal(r.total, 49);
  assert.equal(r.percentage, 0);
});

test('software — payment-terms answered: 10/49 -> 20%', () => {
  const r = getExposureScore({ totalFee: 5000, netDays: 30 }, 'software');
  assert.equal(r.covered, 10);
  assert.equal(r.total, 49);
  assert.equal(r.percentage, 20);
  assert.equal(r.score, 10 / 49);
});

test('software — full state: 56/56 -> 100%', () => {
  const full = {
    totalFee: 5000,
    netDays: 30,
    killFeePercent: 25,
    projectDescription: 'web app',
    deliverablesList: 'api, dashboard',
    hasPreexistingCode: 'no',
    reviewDays: 5,
    fixDays: 3,
    warrantyDays: 30,
    ndaYears: 2,
  };
  const r = getExposureScore(full, 'software');
  assert.equal(r.covered, 56);
  assert.equal(r.total, 56);
  assert.equal(r.percentage, 100);
  assert.equal(r.score, 1);
});

test('software — projectDescription alone triggers acceptance-testing independently (17 total)', () => {
  // acceptance-testing triggers on projectDescription regardless of scope-of-work.
  const r = getExposureScore({ projectDescription: 'web app' }, 'software');
  assert.equal(r.covered, 0);
  assert.equal(r.total, 17); // 10 (payment-terms) + 7 (acceptance-testing)
  assert.equal(r.percentage, 0);
});

// ============================================================================
// getExposureScore — error & determinism cases
// ============================================================================

test('unknown gigType throws with a descriptive message', () => {
  // 'marketing' is a valid Contract.gigType per the DB model, but the scoring
  // walker only knows design + software — it must reject loudly.
  assert.throws(() => getExposureScore({}, 'marketing'), /Unknown gigType/);
  assert.throws(() => getExposureScore({}, 'design '), /Unknown gigType/);
  assert.throws(() => getExposureScore({}, ''), /Unknown gigType/);
});

test('null/undefined state throws (in-operator on non-object)', () => {
  // Documents current behavior: triggersWhen runs, then allQuestionsAnswered
  // hits `field in answeredState` which throws TypeError on null/undefined.
  assert.throws(() => getExposureScore(null, 'design'), TypeError);
  assert.throws(() => getExposureScore(undefined, 'design'), TypeError);
});

test('deterministic — identical input yields byte-identical output across calls', () => {
  const state = { totalFee: 1000, netDays: 15, killFeePercent: 50 };
  const a = getExposureScore(state, 'design');
  const b = getExposureScore(state, 'design');
  assert.deepEqual(a, b);
});

test('NON-monotonicity documented — partial answer can expose a new clause and dip coverage', () => {
  // Answering projectDescription alone does NOT complete scope-of-work (needs
  // deliverablesList too) but DOES trigger acceptance-testing (+7 to denominator,
  // uncovered). Net coverage drops 20 -> 18. This is spec-correct, not a bug.
  const before = getExposureScore({ totalFee: 5000, netDays: 30 }, 'software');
  const after = getExposureScore({ totalFee: 5000, netDays: 30, projectDescription: 'web app' }, 'software');
  assert.equal(before.percentage, 20);
  assert.equal(after.percentage, 18);
  assert.ok(after.percentage < before.percentage,
    `expected coverage dip, got before=${before.percentage} after=${after.percentage}`);
});

// ============================================================================
// getNextQuestions — critical paths
// ============================================================================

test('design — empty state returns only root questions (totalFee, netDays)', () => {
  const qs = getNextQuestions({}, 'design');
  assert.deepEqual(qs.map((q) => q.field), ['totalFee', 'netDays']);
});

test('software — empty state returns only root questions', () => {
  const qs = getNextQuestions({}, 'software');
  assert.deepEqual(qs.map((q) => q.field), ['totalFee', 'netDays']);
});

test('design — caps at 3; order follows clause array', () => {
  // After payment-terms answered, eligible clauses in array order:
  //   kill-fee (killFeePercent), revision-limits (revisionRounds, revisionRate),
  //   intellectual-property (retainPortfolioRights), timeline (initialDays, finalDays), ...
  // First 3 unanswered: killFeePercent, revisionRounds, revisionRate.
  const qs = getNextQuestions({ totalFee: 5000, netDays: 30 }, 'design');
  assert.equal(qs.length, 3);
  assert.deepEqual(qs.map((q) => q.field), ['killFeePercent', 'revisionRounds', 'revisionRate']);
});

test('design — already-answered questions are not re-asked', () => {
  // killFeePercent answered -> kill-fee fully done. Next batch starts at revision-limits.
  const qs = getNextQuestions({ totalFee: 5000, netDays: 30, killFeePercent: 25 }, 'design');
  assert.deepEqual(qs.map((q) => q.field), ['revisionRounds', 'revisionRate', 'retainPortfolioRights']);
});

test('design — all questions answered returns []', () => {
  const full = {
    totalFee: 5000, netDays: 30, killFeePercent: 25,
    revisionRounds: 3, revisionRate: 200, retainPortfolioRights: 'yes',
    usageScope: 'digital', initialDays: 5, finalDays: 10, jurisdiction: 'NYC',
  };
  assert.deepEqual(getNextQuestions(full, 'design'), []);
});

test('software — all questions answered returns []', () => {
  const full = {
    totalFee: 5000, netDays: 30, killFeePercent: 25,
    projectDescription: 'web app', deliverablesList: 'api',
    hasPreexistingCode: 'no', reviewDays: 5, fixDays: 3, warrantyDays: 30, ndaYears: 2,
  };
  assert.deepEqual(getNextQuestions(full, 'software'), []);
});

test('software — dependsOn gating: acceptance-testing withheld until scope-of-work fully answered', () => {
  // projectDescription set but deliverablesList missing -> scope-of-work incomplete
  // -> acceptance-testing (dependsOn scope-of-work) NOT eligible.
  const qs = getNextQuestions(
    { totalFee: 5000, netDays: 30, projectDescription: 'web app' },
    'software',
  );
  const fields = qs.map((q) => q.field);
  assert.ok(!fields.includes('reviewDays'), 'reviewDays leaked before scope-of-work complete');
  assert.ok(!fields.includes('fixDays'), 'fixDays leaked before scope-of-work complete');
});

test('software — acceptance-testing surfaces once scope-of-work fully answered', () => {
  // Answer every other clause; acceptance-testing's two questions should be
  // the only remaining eligible ones.
  const state = {
    totalFee: 5000, netDays: 30, killFeePercent: 25,
    projectDescription: 'web app', deliverablesList: 'api, dashboard',
    hasPreexistingCode: 'no', warrantyDays: 30, ndaYears: 2,
  };
  const qs = getNextQuestions(state, 'software');
  assert.deepEqual(qs.map((q) => q.field), ['reviewDays', 'fixDays']);
});

test('design — trigger gating: clauses with unmet trigger are never returned', () => {
  // Empty state: only payment-terms triggers. No other clause's questions appear.
  const qs = getNextQuestions({}, 'design');
  for (const q of qs) {
    assert.ok(q.field === 'totalFee' || q.field === 'netDays',
      `unexpected field "${q.field}" — only root questions should appear`);
  }
});

test('getNextQuestions — unknown gigType throws', () => {
  assert.throws(() => getNextQuestions({}, 'marketing'), /Unknown gigType/);
});

test('getNextQuestions — deterministic across calls', () => {
  const state = { totalFee: 1, netDays: 1 };
  const a = getNextQuestions(state, 'design').map((q) => q.field);
  const b = getNextQuestions(state, 'design').map((q) => q.field);
  assert.deepEqual(a, b);
});

// ============================================================================
// Full-walk simulation — drives a fresh state to 100% and watches the score
// climb (with the one documented non-monotonic dip along the way).
// ============================================================================

test('full walk — design state reaches 100% by draining getNextQuestions to empty', () => {
  const state = {};
  let guard = 0;
  while (guard++ < 50) {
    const qs = getNextQuestions(state, 'design');
    if (qs.length === 0) break;
    for (const q of qs) state[q.field] = 'answer';
  }
  const r = getExposureScore(state, 'design');
  assert.equal(r.percentage, 100, `walk stalled at ${r.percentage}% — state keys: ${Object.keys(state).join(', ')}`);
  assert.equal(r.covered, r.total);
});

test('full walk — software state reaches 100% by draining getNextQuestions to empty', () => {
  const state = {};
  let guard = 0;
  while (guard++ < 50) {
    const qs = getNextQuestions(state, 'software');
    if (qs.length === 0) break;
    for (const q of qs) state[q.field] = 'answer';
  }
  const r = getExposureScore(state, 'software');
  assert.equal(r.percentage, 100, `walk stalled at ${r.percentage}% — state keys: ${Object.keys(state).join(', ')}`);
  assert.equal(r.covered, r.total);
});
