import { randomUUID } from 'node:crypto';

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
};

function withColor(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

export function createLogger() {
  const log = (level, color, message, meta = {}) => {
    const ts = new Date().toISOString();
    const reqId = meta.reqId || '-';
    const parts = [
      withColor('dim', ts),
      withColor(color, `[${level}]`),
      withColor('blue', `[${reqId}]`),
      message,
    ];
    if (Object.keys(meta).length > 0 && meta.reqId === undefined) {
      parts.push(JSON.stringify(meta));
    }
    console.log(parts.join(' '));
  };

  return {
    info: (message, meta) => log('INFO', 'green', message, meta),
    warn: (message, meta) => log('WARN', 'yellow', message, meta),
    error: (message, meta) => log('ERROR', 'red', message, meta),
    debug: (message, meta) => log('DEBUG', 'dim', message, meta),
  };
}

export function requestIdMiddleware(req, res, next) {
  req.id = randomUUID();
  req.log = createLogger();
  res.setHeader('X-Request-Id', req.id);
  next();
}
