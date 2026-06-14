import { describe, it, expect, vi, beforeAll } from "vitest";
beforeAll(() => { process.env.REMINDER_TOKEN_SECRET = "test-secret-xyz"; });
import { createAcknowledgeToken, verifyAcknowledgeToken } from "./token";

describe("acknowledge tokens", () => {
  it("round-trips a valid token", () => {
    expect(verifyAcknowledgeToken(createAcknowledgeToken("d1"))).toBe("d1");
  });
  it("rejects a tampered payload", () => {
    const [p, mac] = createAcknowledgeToken("d1").split(".");
    expect(verifyAcknowledgeToken(`${p}X.${mac}`)).toBeNull();
  });
  it("rejects a tampered signature", () => {
    const [p, mac] = createAcknowledgeToken("d1").split(".");
    expect(verifyAcknowledgeToken(`${p}.${mac.slice(0, -1)}X`)).toBeNull();
  });
  it("rejects malformed tokens", () => {
    expect(verifyAcknowledgeToken("nodot")).toBeNull();
    expect(verifyAcknowledgeToken("a.b.c")).toBeNull();
  });
  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));
    const t = createAcknowledgeToken("d1");
    vi.setSystemTime(new Date("2026-02-01"));   // > 14-day TTL later
    expect(verifyAcknowledgeToken(t)).toBeNull();
    vi.useRealTimers();
  });
});
