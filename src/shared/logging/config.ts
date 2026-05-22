import fs from 'node:fs';
import path from 'node:path';
import { getFileSink } from '@logtape/file';
import { configure, getConsoleSink } from '@logtape/logtape';
import { config } from '@/shared/config';

const LOGS_DIR_NAME = 'logs';
let isInitialized = false;

/**
 * Configure LogTape for structured logging across the application.
 */
export const initializeLogging = async () => {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  const logDir: string = path.join(process.cwd(), LOGS_DIR_NAME);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  await configure({
    sinks: {
      console: getConsoleSink(),
      file: getFileSink(path.join(logDir, 'app.log')),
    },
    loggers: [
      {
        category: ['logtape', 'meta'],
        sinks: ['console', 'file'],
        lowestLevel: 'warning',
      },
      {
        category: [], // Root logger catch-all for the entire application
        sinks: ['console', 'file'],
        lowestLevel: config.env.node === 'production' ? 'info' : 'debug',
      },
    ],
  });
};
