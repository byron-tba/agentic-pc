import express from "express";
import { ClaudeSkillsAdapter } from "./adapters/claude.js";
import { Analytics } from "./adapters/posthog.js";
import {
  CloseRunRequestSchema,
  ReviewDecisionPayloadSchema,
  SkillExecutionContextSchema,
} from "./contracts/schemas.js";
import { getPool } from "./db/client.js";
import { InMemoryRepository, PgRepository } from "./db/repository.js";
import { QboMcpAdapter } from "./services/mcpAdapter.js";
import { RunOrchestrator } from "./services/orchestrator.js";
import { QaValidator } from "./services/qaValidator.js";
import { RuntimeService } from "./services/runtimeService.js";
import { SkillsService } from "./services/skillsService.js";

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || String(error);
  }
  return String(error);
}

export function createApp() {
  const app = express();
  app.use(express.json());

  const pool = getPool();
  const repo = pool ? new PgRepository(pool) : new InMemoryRepository();
  const analytics = new Analytics();
  const claude = new ClaudeSkillsAdapter();
  const mcp = new QboMcpAdapter();
  const skillsService = new SkillsService(repo, claude);
  const runtime = new RuntimeService(repo, skillsService, claude, mcp);
  const qa = new QaValidator();
  const orchestrator = new RunOrchestrator(repo, skillsService, runtime, qa, analytics);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/runs", async (req, res) => {
    try {
      const body = CloseRunRequestSchema.parse(req.body);
      const result = await orchestrator.runClose(body);
      res.status(201).json(result);
    } catch (error) {
      console.error("POST /runs failed:", error);
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get("/runs/:runId", async (req, res) => {
    const run = await repo.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json(run);
  });

  app.get("/runs/:runId/findings", async (req, res) => {
    const findings = await repo.getFindingsByRun(req.params.runId);
    const grouped = findings.reduce<Record<string, unknown[]>>((acc, row) => {
      if (!acc[row.skill_id]) {
        acc[row.skill_id] = [];
      }
      acc[row.skill_id].push({
        ...row.payload,
        qa_status: row.qa_status,
        qa_reasons: row.qa_reasons,
      });
      return acc;
    }, {});
    res.json({ run_id: req.params.runId, grouped_findings: grouped });
  });

  app.post("/findings/:findingId/decision", async (req, res) => {
    try {
      const payload = ReviewDecisionPayloadSchema.parse(req.body);
      const result = await repo.saveReviewDecision(req.params.findingId, payload);
      analytics.capture("review_decision_recorded", {
        finding_id: req.params.findingId,
        decision: payload.decision,
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });

  app.post("/skills/register", async (req, res) => {
    try {
      const { skill_id, version } = req.body as { skill_id?: string; version?: string };
      if (!skill_id || !version) {
        res.status(400).json({ error: "skill_id and version are required" });
        return;
      }
      const result = await skillsService.registerSkill(skill_id, version);
      res.status(201).json({ skill_id, version, ...result });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });

  app.post("/skills/execute", async (req, res) => {
    try {
      const { skill_id, version, context } = req.body as {
        skill_id?: string;
        version?: string;
        context?: unknown;
      };
      if (!skill_id || !version) {
        res.status(400).json({ error: "skill_id and version are required" });
        return;
      }
      const parsedContext = SkillExecutionContextSchema.parse(context ?? {});
      const result = await runtime.executeSkill(skill_id, version, parsedContext);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });

  return { app, analytics };
}
