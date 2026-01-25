import fs from 'node:fs';
import path from 'node:path';
import { getFileSink } from '@logtape/file';
import { configure, getConsoleSink } from '@logtape/logtape';

const LOGS_DIR_NAME = 'logs';

/**
 * Configure LogTape for structured logging across the application.
 */
export const initializeLogging = async () => {
  const logDir: string = path.join(process.cwd(), LOGS_DIR_NAME);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  await configure({
    sinks: {
      console: getConsoleSink(),
      file: getFileSink(path.join(logDir, 'app.log'), {
        fileNameFormat: path.join(logDir, 'app-{yyyy}{mm}{dd}.log'),
      }),
    },
    loggers: [
      {
        category: [], // Root logger catch-all for the entire application
        sinks: ['console', 'file'],
        lowestLevel: (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      },
    ],
  });
};
