import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Singleton instance of the Fireworks API client using the OpenAI SDK.
 */
class FireworksProvider {
  constructor() {
    if (!process.env.FIREWORKS_API_KEY) {
      console.warn('WARNING: FIREWORKS_API_KEY is not set in the environment variables.');
    }

    this.client = new OpenAI({
      baseURL: 'https://api.fireworks.ai/inference/v1',
      apiKey: process.env.FIREWORKS_API_KEY || '',
      maxRetries: 3, // Built-in exponential backoff
      timeout: 30 * 60 * 1000, // 30 minutes for long context tasks
    });
  }

  getClient() {
    return this.client;
  }
}

export default new FireworksProvider().getClient();
