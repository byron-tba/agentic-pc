import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { McpToolRequest, McpToolResponse } from "../contracts/schemas.js";

type FetchFn = typeof fetch;

export class QboMcpAdapter {
  private fixtureCache: any | null = null;

  constructor(private readonly fetchFn: FetchFn = fetch) {}

  private async loadFixture(): Promise<any> {
    if (this.fixtureCache) {
      return this.fixtureCache;
    }
    const fixturePath = path.join(process.cwd(), "src", "data", "qbo_fixture.json");
    const raw = await readFile(fixturePath, "utf8");
    this.fixtureCache = JSON.parse(raw);
    return this.fixtureCache;
  }

  private async callLiveTool(request: McpToolRequest): Promise<McpToolResponse> {
    if (!config.qboMcpServerUrl) {
      return {
        tool: request.tool,
        ok: false,
        source: "live",
        data: null,
        error: "QBO_MCP_SERVER_URL is not configured",
      };
    }

    const baseUrl = config.qboMcpServerUrl.replace(/\/+$/, "");
    const payload = {
      tool: request.tool,
      client_id: request.client_id,
      params: request.params,
    };

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (config.qboMcpApiKey) {
      headers.authorization = `Bearer ${config.qboMcpApiKey}`;
      headers["x-api-key"] = config.qboMcpApiKey;
    }

    const attempts: Array<{ url: string; body: unknown }> = [
      {
        url: `${baseUrl}/tools/call`,
        body: { name: request.tool, arguments: { client_id: request.client_id, ...request.params } },
      },
      {
        url: `${baseUrl}/api/tools/call`,
        body: { name: request.tool, arguments: { client_id: request.client_id, ...request.params } },
      },
      {
        url: `${baseUrl}/${request.tool}`,
        body: payload,
      },
      {
        url: `${baseUrl}/tool/${request.tool}`,
        body: payload,
      },
    ];

    let lastError = "Unknown live MCP error";

    for (const attempt of attempts) {
      try {
        const response = await this.fetchFn(attempt.url, {
          method: "POST",
          headers,
          body: JSON.stringify(attempt.body),
        });

        const text = await response.text();
        const parsed = text ? JSON.parse(text) : {};

        if (!response.ok) {
          lastError = `HTTP ${response.status}: ${text || response.statusText}`;
          continue;
        }

        const data =
          parsed?.result?.content ??
          parsed?.result ??
          parsed?.data ??
          parsed;

        return {
          tool: request.tool,
          ok: true,
          source: "live",
          data,
        };
      } catch (error) {
        lastError = (error as Error).message;
      }
    }

    return {
      tool: request.tool,
      ok: false,
      source: "live",
      data: null,
      error: `Live MCP call failed: ${lastError}`,
    };
  }

  private async callFixtureTool(request: McpToolRequest): Promise<McpToolResponse> {
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

  async callTool(request: McpToolRequest): Promise<McpToolResponse> {
    if (config.useLiveQboMcp) {
      const live = await this.callLiveTool(request);
      if (live.ok) {
        return live;
      }
    }

    return this.callFixtureTool(request);
  }
}
