import { configure, getConsoleSink } from "@logtape/logtape";

/**
 * Configure LogTape for structured logging across the application.
 */
export const initializeLogging = async () => {
  await configure({
    sinks: {
      console: getConsoleSink(),
    },
    loggers: [
      {
        category: ["hono"],
        sinks: ["console"],
        lowestLevel: (process.env.NODE_ENV === "production" ? "info" : "debug"),
      },
      {
        category: ["app"],
        sinks: ["console"],
        lowestLevel: (process.env.NODE_ENV === "production" ? "info" : "debug"),
      },
      {
        category: ["onboarding"],
        sinks: ["console"],
        lowestLevel: "debug",
      }
    ],
  });
};
