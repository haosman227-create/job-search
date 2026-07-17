/**
 * Minimal structured logger (SPEC-SAAS §9.6). Emits one JSON line per event so
 * logs are queryable with tenant context (businessId/userId/requestId) attached.
 * No external service — stdout JSON is what a platform log drain ingests. The
 * formatter is pure and the sink is injectable so tests assert on output.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface LogRecord extends LogFields {
  level: LogLevel;
  message: string;
  timestamp: string;
}

/** Pure: build the JSON log line. `now` is injectable for deterministic tests. */
export function formatLog(
  level: LogLevel,
  message: string,
  fields: LogFields = {},
  now: Date = new Date(),
): string {
  // Drop undefined values so the line stays clean; never serialize secrets —
  // callers pass ids and codes, not tokens.
  const record: LogRecord = { level, message, timestamp: now.toISOString() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) record[key] = value;
  }
  return JSON.stringify(record);
}

export type LogSink = (level: LogLevel, line: string) => void;

const consoleSink: LogSink = (level, line) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

let sink: LogSink = consoleSink;

/** Swap the sink (tests). Returns a restore function. */
export function setLogSink(next: LogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  sink(level, formatLog(level, message, fields));
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
