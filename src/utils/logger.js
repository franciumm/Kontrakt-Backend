// Minimal logger — keeps `errorHandler.js` and any future module working
// without pulling in a heavyweight logging dependency. In production you'd
// swap this for pino/winston; for now it forwards to console with levels.
const LEVELS = ['error', 'warn', 'info', 'debug'];

function emit(level, msg, meta) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${level.toUpperCase()} ${msg}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta && Object.keys(meta).length) {
    fn(line, JSON.stringify(meta));
  } else {
    fn(line);
  }
}

export const logger = Object.fromEntries(
  LEVELS.map((level) => [level, (msg, meta) => emit(level, msg, meta)])
);
