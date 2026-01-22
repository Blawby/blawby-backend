import { configure, getConsoleSink } from "@logtape/logtape";
import { getFileSink } from "@logtape/file";
import fs from "node:fs";
import path from "node:path";

/**
 * Configure LogTape for structured logging across the application.
 */
export const initializeLogging = async () => {
  const logDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  await configure({
    sinks: {
      console: getConsoleSink(),
      file: getFileSink("logs/app.log", {
        fileNameFormat: "logs/app-{yyyy}{mm}{dd}.log",
      }),
    },
    loggers: [
      {
        category: ["hono"],
        sinks: ["console"],
        lowestLevel: (process.env.NODE_ENV === "production" ? "info" : "debug"),
      },
      {
        category: ["app"],
        sinks: ["console", "file"],
        lowestLevel: (process.env.NODE_ENV === "production" ? "info" : "debug"),
      },
      {
        category: ["onboarding"],
        sinks: ["console", "file"],
        lowestLevel: "debug",
      }
    ],
  });
};
