import { configure, getConsoleSink } from "@logtape/logtape";
import { getFileSink } from "@logtape/file";

/**
 * Configure LogTape for structured logging across the application.
 */
export const initializeLogging = async () => {
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
