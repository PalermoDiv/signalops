import pino from "pino";

// ponytail: pino is already a thin wrapper; no need for another abstraction.
// In development it prints pretty logs; in production it prints JSON.
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});
