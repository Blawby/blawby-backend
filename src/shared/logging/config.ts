import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { getFileSink } from '@logtape/file';
import { configure, getStreamSink, getTextFormatter, type Sink } from '@logtape/logtape';
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

  const sinks: Record<string, Sink> = {
    console: getStreamSink(Writable.toWeb(process.stdout), {
      formatter: getTextFormatter(),
    }),
    file: getFileSink(path.join(logDir, 'app.log')),
  };
  const rootSinks = ['console', 'file'];

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
