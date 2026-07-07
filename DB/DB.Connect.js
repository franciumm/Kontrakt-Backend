import mongoose from 'mongoose';
import { logger } from '../src/utils/logger.js';

export const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error('MONGO_URI is not defined in the environment variables.');
    }

    await mongoose.connect(uri);
    logger.info('Connected to MongoDB successfully.');
  } catch (error) {
    logger.error('Failed to connect to MongoDB', error);
    process.exit(1);
  }
};
