import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { SkillExecutionContext, SkillManifest } from "../contracts/schemas.js";

export type ProviderExecuteResult = {
  rawOutput: unknown;
  findings: unknown[];
};

export class ClaudeSkillsAdapter {
  async registerSkill(manifest: SkillManifest, instructions: string): Promise<{ providerSkillId: string | null }> {
    if (!config.useLiveClaude || !config.claudeApiKey) {
      return { providerSkillId: `mock_${manifest.skill_id}_${manifest.version}` };
    }

    const payload = {
      name: manifest.name,
      description: manifest.purpose,
      instructions,
      metadata: {
        skill_id: manifest.skill_id,
        version: manifest.version,
      },
    };

    const response = await fetch("https://api.anthropic.com/v1/skills", {
      method: "POST",
      headers: {
        "x-api-key": config.claudeApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude skill registration failed: ${response.status} ${errorText}`);
    }

    const body = (await response.json()) as { id?: string };
    return { providerSkillId: body.id ?? null };
  }

  async executeSkill(providerSkillId: string, context: SkillExecutionContext): Promise<ProviderExecuteResult> {
    if (!config.useLiveClaude || !config.claudeApiKey) {
      throw new Error("Live Claude disabled");
    }

    const payload = {
      skill_id: providerSkillId,
      input: {
        client_id: context.client_id,
        period_start: context.period_start,
        period_end: context.period_end,
        input: context.input,
      },
    };

    const response = await fetch("https://api.anthropic.com/v1/skills/execute", {
      method: "POST",
      headers: {
        "x-api-key": config.claudeApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude skill execution failed: ${response.status} ${errorText}`);
    }

    const body = (await response.json()) as { findings?: unknown[] };
    return { rawOutput: body, findings: body.findings ?? [] };
  }
}

export async function loadSkillInstructions(skillRoot: string): Promise<string> {
  const instructionsPath = path.join(skillRoot, "instructions.md");
  return readFile(instructionsPath, "utf8");
}
