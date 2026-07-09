import { jobManager } from '../ws/jobManager.js';
import { AppError } from '../utils/AppError.js';

export async function getJobStatus(req, res, next) {
  try {
    const { id } = req.params;
    const job = await jobManager.getJob(id);

    if (!job) {
      return next(new AppError('Job not found', 404));
    }

    if (String(job.userId) !== String(req.user._id)) {
      return next(new AppError('Unauthorized: job belongs to a different user', 403));
    }

    // Omit subscribers and other internal state.
    res.json({
      success: true,
      data: {
        jobId: job.jobId,
        operation: job.operation,
        state: job.state,
        status: job.status,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}
