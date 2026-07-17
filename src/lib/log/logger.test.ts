import { describe, expect, it, vi } from "vitest";
import { formatLog, logger, setLogSink, type LogLevel } from "./logger";

describe("formatLog", () => {
  it("emits a single JSON line with level, message, and timestamp", () => {
    const line = formatLog(
      "info",
      "request",
      { businessId: "biz-1", status: 200 },
      new Date("2026-07-17T00:00:00Z"),
    );
    expect(JSON.parse(line)).toEqual({
      level: "info",
      message: "request",
      timestamp: "2026-07-17T00:00:00.000Z",
      businessId: "biz-1",
      status: 200,
    });
  });

  it("drops undefined fields so the line stays clean", () => {
    const parsed = JSON.parse(
      formatLog("warn", "x", { a: undefined, b: 1 }),
    );
    expect(parsed).not.toHaveProperty("a");
    expect(parsed.b).toBe(1);
  });
});

describe("logger sink", () => {
  it("routes messages through the active sink with their level", () => {
    const calls: Array<[LogLevel, string]> = [];
    const restore = setLogSink((level, line) => calls.push([level, line]));
    try {
      logger.error("boom", { code: "internal_error" });
    } finally {
      restore();
    }
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("error");
    expect(JSON.parse(calls[0][1])).toMatchObject({
      level: "error",
      message: "boom",
      code: "internal_error",
    });
  });

  it("restores the previous sink so tests don't leak", () => {
    const spy = vi.fn();
    const restore = setLogSink((_l, line) => spy(line));
    restore();
    logger.info("after restore");
    expect(spy).not.toHaveBeenCalled();
  });
});
