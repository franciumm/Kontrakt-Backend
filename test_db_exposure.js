import mongoose from 'mongoose';
import { startContract, answerQuestions, generateReport } from './src/services/contract.service.js';
import { Contract } from './DB/models/Contract.Model.js';
import { User } from './DB/models/User.Model.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  // get a user
  const user = await User.findOne();
  if (!user) throw new Error('No user found');
  const userId = user._id;

  console.log('Starting contract...');
  const startResult = await startContract(userId, 'I am building a web app for a client.');
  const contractId = startResult.contractId;

  console.log('Start Score:', startResult.exposureScore);

  console.log('Answering first batch of questions...');
  let answerResult = await answerQuestions(contractId, userId, {
    totalFee: 1000,
    netDays: 30
  });

  console.log('Score after payment terms:', answerResult.exposureScore);

  console.log('Generating report...');
  // Note: generateReport returns { report } but updates contract in DB
  await generateReport(contractId, userId);

  // Check DB manually
  const contract = await Contract.findById(contractId);
  console.log('DB Exposure Score after report:', contract.exposureScore);
  
  // Also let's check gapClauses directly
  const { softwareClauses } = await import('./src/data/clauses/software.clauses.js');
  const clauseSet = softwareClauses;
  const gapClauses = clauseSet.filter((clause) => {
    if (!clause.triggersWhen(contract.answeredState)) return false;
    return !clause.questions.every((q) => q.field in contract.answeredState);
  });
  console.log('Gap clauses:', gapClauses.map(c => c.id));

  await mongoose.disconnect();
}

run().catch(console.error);
