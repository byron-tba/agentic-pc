import { describe, expect, test } from "vitest";
import { QboMcpAdapter } from "../src/services/mcpAdapter.js";

describe("QboMcpAdapter", () => {
  test("returns fixture transactions", async () => {
    const adapter = new QboMcpAdapter();
    const result = await adapter.callTool({
      tool: "get_transactions",
      client_id: "client_demo",
      params: {},
    });

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown[]).length).toBeGreaterThan(0);
  });

  test("returns error for unsupported tool", async () => {
    const adapter = new QboMcpAdapter();
    const result = await adapter.callTool({
      tool: "unknown_tool",
      client_id: "client_demo",
      params: {},
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unsupported MCP tool");
  });
});
