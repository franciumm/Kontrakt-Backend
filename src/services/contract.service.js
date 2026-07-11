// src/services/contract.service.js
// Contract orchestration service — coordinates graphWalker, contractAssembly,
// and MongoDB persistence for the contract interrogator flow.

import { getNextQuestions, getExposureScore } from '../lib/graphWalker.js';
import {
  parseGigDescription,
  generateContractStream,
  generateExposureReport,
} from './contractAssembly.service.js';
import { Contract } from '../../DB/models/Contract.Model.js';
import { designClauses } from '../data/clauses/design.clauses.js';
import { softwareClauses } from '../data/clauses/software.clauses.js';
import { AppError } from '../utils/AppError.js';

/**
 * Get the clause set for a gig type.
 */
function getClauseSet(gigType) {
  if (gigType === 'design') return designClauses;
  if (gigType === 'software') return softwareClauses;
  return designClauses; // fallback to design for unknown types
}

/**
 * Start a new contract session.
 *
 * 1. Parse the gig description to extract intent (gigType + entities).
 * 2. Get the first set of questions from the graph walker.
 * 3. Create a Contract document in MongoDB.
 *
 * @param {string} userId
 * @param {string} gigDescription
 * @returns {Promise<{ contractId, gigType, nextQuestions, exposureScore }>}
 */
export async function startContract(userId, gigDescription) {
  // Parse gig description to detect type.
  const parsed = await parseGigDescription(gigDescription);

  // Normalize gigType — only 'design' and 'software' are supported.
  let gigType = parsed.gigType;
  if (gigType !== 'design' && gigType !== 'software') {
    gigType = 'design'; // default fallback per DESIGN.md
  }

  const answeredState = {};
  const nextQuestions = getNextQuestions(answeredState, gigType);
  const exposure = getExposureScore(answeredState, gigType);

  // Build a title from the gig description (first 80 chars).
  const title = gigDescription.length > 80
    ? gigDescription.substring(0, 77) + '...'
    : gigDescription;

  const contract = await Contract.create({
    userId,
    title,
    gigDescription,
    gigType,
    answeredState,
    exposureScore: exposure.percentage,
  });

  return {
    contractId: String(contract._id),
    gigType,
    entities: parsed.entities || [],
    nextQuestions,
    exposureScore: exposure,
  };
}

/**
 * Process answers and return the next set of questions.
 *
 * @param {string} contractId
 * @param {string} userId
 * @param {Record<string, string>} answers
 * @returns {Promise<{ nextQuestions, exposureScore, done }>}
 */
export async function answerQuestions(contractId, userId, answers) {
  const contract = await Contract.findOne({ _id: contractId, userId });
  if (!contract) {
    throw new AppError('Contract not found', 404, 'CONTRACT_NOT_FOUND');
  }

  // Merge new answers into the existing answered state.
  const answeredState = { ...contract.answeredState, ...answers };
  const nextQuestions = getNextQuestions(answeredState, contract.gigType);
  const exposure = getExposureScore(answeredState, contract.gigType);

  // Update contract in DB.
  contract.answeredState = answeredState;
  contract.exposureScore = exposure.percentage;
  contract.markModified('answeredState');
  await contract.save();

  return {
    nextQuestions,
    exposureScore: exposure,
    done: nextQuestions.length === 0,
  };
}

/**
 * Generate the final contract text by streaming from the LLM.
 *
 * @param {string} contractId
 * @param {string} userId
 * @param {{ onStatus?: (status: string, data?: object) => void }} [opts]
 * @returns {Promise<{ generatedText: string }>}
 */
export async function generateContract(contractId, userId, opts = {}) {
  const { onStatus } = opts;
  const contract = await Contract.findOne({ _id: contractId, userId });
  if (!contract) {
    throw new AppError('Contract not found', 404, 'CONTRACT_NOT_FOUND');
  }

  const clauseSet = getClauseSet(contract.gigType);

  // Get the clause nodes that are triggered and fully answered.
  const answeredClauses = clauseSet.filter((clause) => {
    if (!clause.triggersWhen(contract.answeredState)) return false;
    return clause.questions.every((q) => q.field in contract.answeredState);
  });

  if (onStatus) onStatus('assembling-contract');

  const stream = await generateContractStream(
    contract.gigDescription,
    contract.answeredState,
    answeredClauses
  );

  // Collect the streamed tokens.
  let generatedText = '';
  if (onStatus) onStatus('streaming');
  for await (const chunk of stream) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      generatedText += content;
    }
  }

  // Save to DB.
  contract.generatedText = generatedText;
  contract.status = 'finalized';
  await contract.save();

  return { generatedText };
}

/**
 * Generate the exposure report for a contract.
 *
 * @param {string} contractId
 * @param {string} userId
 * @returns {Promise<{ report: string }>}
 */
export async function generateReport(contractId, userId) {
  const contract = await Contract.findOne({ _id: contractId, userId });
  if (!contract) {
    throw new AppError('Contract not found', 404, 'CONTRACT_NOT_FOUND');
  }

  const clauseSet = getClauseSet(contract.gigType);

  // Covered clauses = triggered + all questions answered.
  const coveredClauses = clauseSet.filter((clause) => {
    if (!clause.triggersWhen(contract.answeredState)) return false;
    return clause.questions.every((q) => q.field in contract.answeredState);
  });

  // Gap clauses = triggered but NOT all questions answered.
  const gapClauses = clauseSet.filter((clause) => {
    if (!clause.triggersWhen(contract.answeredState)) return false;
    return !clause.questions.every((q) => q.field in contract.answeredState);
  });

  const report = await generateExposureReport(coveredClauses, gapClauses);

  const exposureScores = getExposureScore(contract.answeredState, contract.gigType);

  // Save report to DB.
  contract.exposureReport = report;
  await contract.save();

  return { report, exposureScores };
}
