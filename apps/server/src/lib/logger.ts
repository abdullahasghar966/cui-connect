import pino from 'pino';
import { env } from '../config/env';

const pretty = env.NODE_ENV === 'development' && process.stdout.isTTY !== false;

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});
