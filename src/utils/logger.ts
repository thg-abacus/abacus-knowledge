type LogLevel = "error" | "warn" | "info" | "debug";

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

let currentLevel: LogLevel = "info";

export function setLogLevel(level: string) {
  const l = level.toLowerCase();
  if (l in LEVELS) currentLevel = l as LogLevel;
}

function log(level: LogLevel, msg: string, meta?: unknown) {
  if (LEVELS[level] > LEVELS[currentLevel]) return;
  const entry = { time: new Date().toISOString(), level, msg, ...(meta ? { meta } : {}) };
  const line = JSON.stringify(entry);
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const logger = {
  error: (msg: string, meta?: unknown) => log("error", msg, meta),
  warn: (msg: string, meta?: unknown) => log("warn", msg, meta),
  info: (msg: string, meta?: unknown) => log("info", msg, meta),
  debug: (msg: string, meta?: unknown) => log("debug", msg, meta),
};
