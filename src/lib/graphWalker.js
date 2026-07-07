// src/lib/graphWalker.js
// Pure domain logic — clause-graph walker for the interrogator flow.
// Selects next unanswered questions based on dependency resolution and
// computes an exposure-coverage score.

import { designClauses } from '../data/clauses/design.clauses.js';
import { softwareClauses } from '../data/clauses/software.clauses.js';

/**
 * Select the right clause set by gig type.
 * @param {'design' | 'software'} gigType
 * @returns {Array} The clause set for the given gig type.
 */
function getClauseSet(gigType) {
  if (gigType === 'design') return designClauses;
  if (gigType === 'software') return softwareClauses;
  throw new Error(`Unknown gigType: "${gigType}". Expected "design" or "software".`);
}

/**
 * Check whether ALL questions in a clause have been answered.
 * A question is considered answered when its field name exists as a key in answeredState.
 * @param {object} clause
 * @param {object} answeredState
 * @returns {boolean}
 */
function allQuestionsAnswered(clause, answeredState) {
  return clause.questions.every((q) => q.field in answeredState);
}

/**
 * Check whether all dependency clauses have ALL their questions answered.
 * @param {object} clause
 * @param {Array} clauseSet
 * @param {object} answeredState
 * @returns {boolean}
 */
function dependenciesSatisfied(clause, clauseSet, answeredState) {
  if (!clause.dependsOn || clause.dependsOn.length === 0) return true;

  return clause.dependsOn.every((depId) => {
    const depClause = clauseSet.find((c) => c.id === depId);
    // If the dependency clause doesn't exist in the set, treat as satisfied
    // (defensive — avoids blocking on misconfigured data).
    if (!depClause) return true;
    return allQuestionsAnswered(depClause, answeredState);
  });
}

/**
 * Get the next 1–3 unanswered questions from eligible clauses.
 *
 * A clause is eligible when:
 *   (a) triggersWhen(answeredState) returns true
 *   (b) all dependsOn clause ids have ALL their questions answered
 *   (c) the clause has at least one question whose field is NOT yet in answeredState
 *
 * From the eligible clauses, collect unanswered questions and return the first 1–3.
 *
 * @param {object} answeredState — map of field → answer value
 * @param {'design' | 'software'} gigType
 * @returns {Array} Up to 3 unanswered question objects
 */
export function getNextQuestions(answeredState, gigType) {
  const clauseSet = getClauseSet(gigType);

  const eligibleClauses = clauseSet.filter((clause) => {
    // (a) triggers condition is met
    if (!clause.triggersWhen(answeredState)) return false;

    // (b) all dependencies have their questions fully answered
    if (!dependenciesSatisfied(clause, clauseSet, answeredState)) return false;

    // (c) at least one unanswered question remains in this clause
    const hasUnanswered = clause.questions.some((q) => !(q.field in answeredState));
    return hasUnanswered;
  });

  // Collect all unanswered questions across eligible clauses
  const unansweredQuestions = [];
  for (const clause of eligibleClauses) {
    for (const question of clause.questions) {
      if (!(question.field in answeredState)) {
        unansweredQuestions.push(question);
      }
    }
  }

  // Return the first 1–3
  return unansweredQuestions.slice(0, 3);
}

/**
 * Compute the exposure-coverage score.
 *
 * totalWeight  = sum of exposureWeight for all clauses where triggersWhen(answeredState) is true.
 * coveredWeight = sum of exposureWeight for those triggered clauses where ALL questions are answered.
 *
 * @param {object} answeredState — map of field → answer value
 * @param {'design' | 'software'} gigType
 * @returns {{ score: number, covered: number, total: number, percentage: number }}
 */
export function getExposureScore(answeredState, gigType) {
  const clauseSet = getClauseSet(gigType);

  let totalWeight = 0;
  let coveredWeight = 0;

  for (const clause of clauseSet) {
    if (!clause.triggersWhen(answeredState)) continue;

    totalWeight += clause.exposureWeight;

    if (allQuestionsAnswered(clause, answeredState)) {
      coveredWeight += clause.exposureWeight;
    }
  }

  const score = totalWeight === 0 ? 0 : coveredWeight / totalWeight;

  return {
    score,
    covered: coveredWeight,
    total: totalWeight,
    percentage: Math.round(score * 100),
  };
}
