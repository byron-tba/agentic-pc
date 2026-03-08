import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { McpToolRequest, McpToolResponse } from "../contracts/schemas.js";

export class QboMcpAdapter {
  private fixtureCache: any | null = null;

  private async loadFixture(): Promise<any> {
    if (this.fixtureCache) {
      return this.fixtureCache;
    }
    const fixturePath = path.join(process.cwd(), "src", "data", "qbo_fixture.json");
    const raw = await readFile(fixturePath, "utf8");
    this.fixtureCache = JSON.parse(raw);
    return this.fixtureCache;
  }

  async callTool(request: McpToolRequest): Promise<McpToolResponse> {
    if (config.useLiveQboMcp) {
      return {
        tool: request.tool,
        ok: false,
        source: "live",
        data: null,
        error: "Live QBO MCP is not configured in this prototype build.",
      };
    }

    const fixture = await this.loadFixture();
    switch (request.tool) {
      case "get_transactions":
        return { tool: request.tool, ok: true, source: "fixture", data: fixture.transactions };
      case "get_accounts":
        return { tool: request.tool, ok: true, source: "fixture", data: fixture.accounts };
      case "get_reconciliations":
        return { tool: request.tool, ok: true, source: "fixture", data: fixture.reconciliations };
      default:
        return {
          tool: request.tool,
          ok: false,
          source: "fixture",
          data: null,
          error: `Unsupported MCP tool: ${request.tool}`,
        };
    }
  }
}
