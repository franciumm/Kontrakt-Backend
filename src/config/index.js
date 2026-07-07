import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Please set it in your .env file or environment.`
    );
  }
  return value;
}

export const config = Object.freeze({
  port: Number(process.env.PORT) || 3000,
  fireworksApiKey: requireEnv('FIREWORKS_API_KEY'),
  fireworksModel:
    process.env.FIREWORKS_MODEL ||
    'accounts/fireworks/models/kimi-k2-instruct-0905',
  nodeEnv: process.env.NODE_ENV || 'development',
});
