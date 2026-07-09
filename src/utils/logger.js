import pino from 'pino';
import { config } from '../config/index.js';

// Pino configuration with built-in redaction for sensitive fields
const pinoConfig = {
  level: config.nodeEnv === 'test' ? 'silent' : 'info',
  redact: {
    paths: [
      'key', 'secret', 'password', 'token', 'auth', 'authorization', 'cookie',
      '*.key', '*.secret', '*.password', '*.token', '*.auth', '*.authorization', '*.cookie'
    ],
    censor: '[REDACTED]',
  },
};

// Use pino-pretty in development for readable console output
if (config.nodeEnv !== 'production' && config.nodeEnv !== 'test') {
  pinoConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
}

export const logger = pino(pinoConfig);
