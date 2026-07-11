import { startContract, answerQuestions } from './src/services/contract.service.js';
import { getNextQuestions, getExposureScore } from './src/lib/graphWalker.js';

// We don't need DB, we can just test the pure logic
const state = {};
const gigType = 'software';

console.log('1. INITIAL STATE');
let exposure = getExposureScore(state, gigType);
let nextQ = getNextQuestions(state, gigType);
console.log('Exposure:', exposure);
console.log('Next Qs:', nextQ.map(q => q.field));

// Answer the first questions
console.log('\n2. AFTER ANSWERING totalFee and netDays');
state.totalFee = 5000;
state.netDays = 30;
exposure = getExposureScore(state, gigType);
nextQ = getNextQuestions(state, gigType);
console.log('Exposure:', exposure);
console.log('Next Qs:', nextQ.map(q => q.field));

// Answer the killFeePercent
console.log('\n3. AFTER ANSWERING killFeePercent');
state.killFeePercent = 25;
exposure = getExposureScore(state, gigType);
nextQ = getNextQuestions(state, gigType);
console.log('Exposure:', exposure);
console.log('Next Qs:', nextQ.map(q => q.field));

// Answer scope of work
console.log('\n4. AFTER ANSWERING scope of work');
state.projectDescription = 'web app';
state.deliverablesList = 'code, docs';
exposure = getExposureScore(state, gigType);
nextQ = getNextQuestions(state, gigType);
console.log('Exposure:', exposure);
console.log('Next Qs:', nextQ.map(q => q.field));

// Keep answering
console.log('\n5. AFTER ANSWERING IP and Acceptance');
state.hasPreexistingCode = 'no';
state.reviewDays = 5;
state.fixDays = 5;
exposure = getExposureScore(state, gigType);
nextQ = getNextQuestions(state, gigType);
console.log('Exposure:', exposure);
console.log('Next Qs:', nextQ.map(q => q.field));

console.log('\n6. AFTER ANSWERING Warranty and NDA');
state.warrantyDays = 30;
state.ndaYears = 2;
exposure = getExposureScore(state, gigType);
nextQ = getNextQuestions(state, gigType);
console.log('Exposure:', exposure);
console.log('Next Qs:', nextQ.map(q => q.field));
