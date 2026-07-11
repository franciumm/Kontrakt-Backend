// src/controllers/contract.controller.js
// Contract interrogator HTTP handlers — all use the job-based 202 pattern.

import { AppError } from '../utils/AppError.js';
import {
  startContract,
  answerQuestions,
  generateContract,
  generateReport,
} from '../services/contract.service.js';
import { jobManager } from '../ws/jobManager.js';
import { OPERATIONS } from '../constants/jobStatus.js';
import { Contract } from '../../DB/models/Contract.Model.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/contract/start
 * Begin a new contract session — parses gig description and returns first questions.
 */
export async function startContractHandler(req, res, next) {
  try {
    const { gigDescription } = req.body;
    const userId = req.user._id;

    const { jobId } = await jobManager.createJob(userId, OPERATIONS.CONTRACT_START);
    res.status(202).json({ jobId });

    (async () => {
      try {
        jobManager.emitStatus(jobId, 'parsing-gig');
        const result = await startContract(userId, gigDescription);
        jobManager.completeJob(jobId, result);
      } catch (error) {
        logger.error('[contract:start] job failed', { jobId, message: error.message });
        jobManager.failJob(jobId, error);
      }
    })();
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/contract/answer
 */
export async function answerContractHandler(req, res, next) {
  try {
    const { contractId, answers } = req.body;
    const userId = req.user._id;

    const { jobId } = await jobManager.createJob(userId, OPERATIONS.CONTRACT_ANSWER);
    res.status(202).json({ jobId });

    (async () => {
      try {
        jobManager.emitStatus(jobId, 'computing-exposure');
        const result = await answerQuestions(contractId, userId, answers);
        jobManager.completeJob(jobId, result);
      } catch (error) {
        logger.error('[contract:answer] job failed', { jobId, message: error.message });
        jobManager.failJob(jobId, error);
      }
    })();
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/contract/generate
 * Generate the final contract text from the answered state.
 */
export async function generateContractHandler(req, res, next) {
  try {
    const { contractId } = req.body;
    const userId = req.user._id;

    const { jobId } = await jobManager.createJob(userId, OPERATIONS.CONTRACT_GENERATE);
    res.status(202).json({ jobId });

    (async () => {
      try {
        const onStatus = (status, data) => jobManager.emitStatus(jobId, status, data);
        const result = await generateContract(contractId, userId, { onStatus });
        jobManager.completeJob(jobId, result);
      } catch (error) {
        logger.error('[contract:generate] job failed', { jobId, message: error.message });
        jobManager.failJob(jobId, error);
      }
    })();
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/contract/report
 * Generate the exposure report for a contract.
 */
export async function generateReportHandler(req, res, next) {
  try {
    const { contractId } = req.body;
    const userId = req.user._id;

    const { jobId } = await jobManager.createJob(userId, OPERATIONS.CONTRACT_REPORT);
    res.status(202).json({ jobId });

    (async () => {
      try {
        jobManager.emitStatus(jobId, 'generating-report');
        const result = await generateReport(contractId, userId);
        jobManager.completeJob(jobId, result);
      } catch (error) {
        logger.error('[contract:report] job failed', { jobId, message: error.message });
        jobManager.failJob(jobId, error);
      }
    })();
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/contract/history
 * Paginated list of the user's contracts.
 */
export async function getContractHistory(req, res, next) {
  try {
    const userId = req.user._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [contracts, total] = await Promise.all([
      Contract.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-generatedText -exposureReport') // Exclude large fields in list view
        .lean(),
      Contract.countDocuments({ userId }),
    ]);

    return res.status(200).json({
      success: true,
      data: contracts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/contract/:id
 * Single contract by ID (with ownership check).
 */
export async function getContractById(req, res, next) {
  try {
    const contract = await Contract.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!contract) {
      return next(new AppError('Contract not found', 404));
    }
    return res.status(200).json({ success: true, data: contract });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/contract/presets
 * Returns predefined contract workflows.
 */
export async function getContractPresets(req, res, next) {
  try {
    const presets = [
      {
        id: 'standard-web-dev',
        title: 'Standard Web Development',
        description: 'A standard web development contract covering milestones, IP transfer upon payment, and 30-day warranty.',
      },
      {
        id: 'ui-ux-design',
        title: 'UI/UX Design',
        description: 'Design contract including 2 revision rounds and portfolio showcase rights.',
      },
      {
        id: 'retainer-consulting',
        title: 'Monthly Retainer Consulting',
        description: 'Ongoing consulting agreement with 30-day cancellation notice.',
      },
    ];

    return res.status(200).json({
      success: true,
      data: presets,
    });
  } catch (error) {
    next(error);
  }
}
