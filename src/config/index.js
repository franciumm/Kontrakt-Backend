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

// Secrets default to a dev-only constant when unset so tests and local dev
// don't need to provision real keys. In production, missing secrets are a
// hard failure — never let the app boot with the dev default signing real
// user tokens.
function resolveSecret(name, devDefault) {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable in production: ${name}`);
  }
  return devDefault;
}

export const config = Object.freeze({
  port: Number(process.env.PORT) || 3000,
  fireworksApiKey: requireEnv('FIREWORKS_API_KEY'),
  fireworksModel:
    process.env.FIREWORKS_MODEL ||
    'accounts/fireworks/models/kimi-k2-instruct-0905',
  nodeEnv: process.env.NODE_ENV || 'development',
  auth: Object.freeze({
    jwtAccessSecret: resolveSecret('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    jwtRefreshSecret: resolveSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    extractTokenSecret: resolveSecret('JWT_EXTRACT_SECRET', 'dev-extract-secret-change-me'),
    accessTokenExpiresIn: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_TTL || '7d',
    extractTokenExpiresIn: process.env.JWT_EXTRACT_TTL || '15m',
    saltRounds: Number(process.env.JWT_SALT_ROUNDS) || 12,
  }),
});
