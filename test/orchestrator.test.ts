import { describe, expect, test } from "vitest";
import { InMemoryRepository } from "../src/db/repository.js";
import { RunOrchestrator } from "../src/services/orchestrator.js";
import { QaValidator } from "../src/services/qaValidator.js";

class NoopAnalytics {
  capture(): void {}
}

describe("orchestrator resilience", () => {
  test("continues run after one skill failure", async () => {
    const repo = new InMemoryRepository();
    const qa = new QaValidator();

    const skillsService = {
      async listSkillPackages() {
        return [
          { manifest: { skill_id: "skill_fail", version: "v1" } },
          { manifest: { skill_id: "skill_ok", version: "v1" } },
        ];
      },
    } as any;

    const runtime = {
      async executeSkill(skillId: string) {
        if (skillId === "skill_fail") {
          throw new Error("expected failure");
        }
        return {
          executionMode: "fixture",
          rawProviderOutput: {},
          toolUsage: ["get_transactions"],
          findings: [
            {
              finding_id: "f_ok",
              skill_id: "skill_ok",
              entity_type: "transaction",
              entity_ref: "txn_1",
              severity: "medium",
              risk_score: 60,
              confidence_score: 70,
              summary: "ok",
              rationale: "ok",
              recommended_action: "review",
              evidence: ["fact"],
              requires_human_review: true,
            },
          ],
        };
      },
    } as any;

    const orchestrator = new RunOrchestrator(repo, skillsService, runtime, qa, new NoopAnalytics() as any);
    const run = await orchestrator.runClose({
      client_id: "client_demo",
      period_start: "2026-02-01",
      period_end: "2026-02-28",
    });

    expect(run.status).toBe("completed");
    const findings = await repo.getFindingsByRun(run.run_id);
    expect(findings.length).toBe(1);
    expect(findings[0].skill_id).toBe("skill_ok");
  });
});

