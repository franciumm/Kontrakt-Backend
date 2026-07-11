import { getExposureScore, getNextQuestions } from './src/lib/graphWalker.js';

const state = {};
const gigType = 'software';

console.log('Initial score:', getExposureScore(state, gigType));

// Answer payment terms
state.totalFee = 1000;
state.netDays = 30;

console.log('Score after payment terms:', getExposureScore(state, gigType));

// What are the next questions?
let next = getNextQuestions(state, gigType);
console.log('Next questions:', next);

// Let's answer everything
const qsToAnswer = [
  'killFeePercent',
  'projectDescription',
  'deliverablesList',
  'hasPreexistingCode',
  'reviewDays',
  'fixDays',
  'warrantyDays',
  'ndaYears'
];

for (const q of qsToAnswer) {
  state[q] = 'answer';
}

console.log('Score after all answers:', getExposureScore(state, gigType));
