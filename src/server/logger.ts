import pino from "pino";
import { readOmcEnv } from "./env.ts";

export type Logger = pino.Logger;

const isProduction = process.env.NODE_ENV === "production";

export const logger: Logger = pino({
  level: readOmcEnv("LOG_LEVEL") ?? "info",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
      },
  redact: {
    paths: [
      "*.authorization",
      "*.clientSecret",
      "*.cookie",
      "*.password",
      "*.secret",
      "*.token",
      "*.values.*",
      "authorization",
      "clientSecret",
      "cookie",
      "password",
      "secret",
      "token",
      "values.*",
    ],
    censor: "[redacted]",
  },
});
