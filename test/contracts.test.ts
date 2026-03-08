import { describe, expect, test } from "vitest";
import { CloseRunRequestSchema, FindingSchema } from "../src/contracts/schemas.js";

describe("contract schemas", () => {
  test("accepts valid close run request", () => {
    const parsed = CloseRunRequestSchema.parse({
      client_id: "client_demo",
      period_start: "2026-02-01",
      period_end: "2026-02-28",
    });
    expect(parsed.client_id).toBe("client_demo");
  });

  test("rejects invalid calendar date", () => {
    const result = CloseRunRequestSchema.safeParse({
      client_id: "client_demo",
      period_start: "2026-02-01",
      period_end: "2026-02-29",
    });
    expect(result.success).toBe(false);
  });

  test("rejects end before start", () => {
    const result = CloseRunRequestSchema.safeParse({
      client_id: "client_demo",
      period_start: "2026-03-01",
      period_end: "2026-02-28",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid finding payload", () => {
    const result = FindingSchema.safeParse({
      finding_id: "f1",
      skill_id: "skill",
      severity: "high",
    });
    expect(result.success).toBe(false);
  });
});
