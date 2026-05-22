import fs from 'node:fs';
import path from 'node:path';
import { getFileSink } from '@logtape/file';
import { configure, getConsoleSink, getTextFormatter, type Sink } from '@logtape/logtape';
import { config } from '@/shared/config';

const LOGS_DIR_NAME = 'logs';
let isInitialized = false;

const consoleFormatter = getTextFormatter({
  timestamp: 'disabled',
  format: ({ category, message }) => {
    const prefix = category ? `[${category}] ` : '';
    return `${prefix}${message}`;
  },
});

const shouldWriteFileLogs = () =>
  process.env.LOG_TO_FILE === 'true' ||
  (process.env.RUNNING_IN_CLOUDFLARE_CONTAINER !== 'true' && !config.env.isProductionLike);

/**
 * Configure LogTape for structured logging across the application.
 */
export const initializeLogging = async () => {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  const sinks: Record<string, Sink> = {
    console: getConsoleSink({
      formatter: consoleFormatter,
    }),
  };
  const rootSinks = ['console'];

  if (shouldWriteFileLogs()) {
    const logDir: string = path.join(process.cwd(), LOGS_DIR_NAME);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    sinks.file = getFileSink(path.join(logDir, 'app.log'));
    rootSinks.push('file');
  }

  await configure({
    sinks,
    loggers: [
      {
        category: ['logtape', 'meta'],
        sinks: rootSinks,
        lowestLevel: 'warning',
      },
      {
        category: [], // Root logger catch-all for the entire application
        sinks: rootSinks,
        lowestLevel: config.env.node === 'production' ? 'info' : 'debug',
      },
    ],
  });
};
