import dotenv from "dotenv";

dotenv.config();

export type AppConfig = {
  port: number;
  databaseUrl: string | null;
  posthogApiKey: string | null;
  posthogHost: string;
  claudeApiKey: string | null;
  claudeModel: string;
  useLiveClaude: boolean;
  useLiveQboMcp: boolean;
  qboMcpServerUrl: string | null;
  qboMcpApiKey: string | null;
};

function envFlag(value: string | undefined, defaultValue = false): boolean {
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? null,
  posthogApiKey: process.env.POSTHOG_API_KEY ?? null,
  posthogHost: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
  claudeApiKey: process.env.CLAUDE_API_KEY ?? null,
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-3-7-sonnet-latest",
  useLiveClaude: envFlag(process.env.USE_LIVE_CLAUDE, false),
  useLiveQboMcp: envFlag(process.env.USE_LIVE_QBO_MCP, false),
  qboMcpServerUrl: process.env.QBO_MCP_SERVER_URL ?? null,
  qboMcpApiKey: process.env.QBO_MCP_API_KEY ?? null,
};
