import { CloseRunRequestSchema, type CloseRunRequest, type ExecutionLog, type SkillExecutionContext } from "../contracts/schemas.js";
import type { Repository } from "../db/repository.js";
import { makeId, nowIso } from "../utils.js";
import { Analytics } from "../adapters/posthog.js";
import { QaValidator } from "./qaValidator.js";
import { RuntimeService } from "./runtimeService.js";
import { SkillsService } from "./skillsService.js";

export class RunOrchestrator {
  constructor(
    private readonly repo: Repository,
    private readonly skillsService: SkillsService,
    private readonly runtime: RuntimeService,
    private readonly qa: QaValidator,
    private readonly analytics: Analytics,
  ) {}

  async runClose(request: CloseRunRequest): Promise<{ run_id: string; status: string }> {
    const parsed = CloseRunRequestSchema.parse(request);
    const runId = makeId("run");

    await this.repo.upsertClient(parsed.client_id, `Client ${parsed.client_id}`);
    await this.repo.createRun({
      run_id: runId,
      client_id: parsed.client_id,
      period_start: parsed.period_start,
      period_end: parsed.period_end,
      status: "running",
      started_at: nowIso(),
    });

    this.analytics.capture("close_run_started", {
      run_id: runId,
      client_id: parsed.client_id,
      period_start: parsed.period_start,
      period_end: parsed.period_end,
    });

    const skillPackages = await this.skillsService.listSkillPackages();
    const selected = parsed.skill_ids?.length
      ? skillPackages.filter((pkg) => parsed.skill_ids?.includes(pkg.manifest.skill_id))
      : skillPackages;

    const context: SkillExecutionContext = {
      client_id: parsed.client_id,
      period_start: parsed.period_start,
      period_end: parsed.period_end,
      run_id: runId,
      input: {},
    };

    for (const skillPkg of selected) {
      const log: ExecutionLog = {
        run_id: runId,
        skill_id: skillPkg.manifest.skill_id,
        version: skillPkg.manifest.version,
        status: "started",
        execution_mode: "fixture",
        started_at: nowIso(),
        tool_usage: [],
      };

      const executionId = await this.repo.createExecution(log);
      this.analytics.capture("skill_execution_started", {
        run_id: runId,
        client_id: parsed.client_id,
        skill_id: skillPkg.manifest.skill_id,
        version: skillPkg.manifest.version,
      });

      try {
        const result = await this.runtime.executeSkill(skillPkg.manifest.skill_id, skillPkg.manifest.version, context);

        for (const finding of result.findings) {
          const qaResult = this.qa.validate(finding);
          await this.repo.saveFinding(runId, finding, qaResult);

          if (qaResult.status === "fail") {
            this.analytics.capture("finding_qa_failed", {
              run_id: runId,
              skill_id: finding.skill_id,
              finding_id: finding.finding_id,
              reasons: qaResult.reasons,
            });
          } else {
            this.analytics.capture("finding_created", {
              run_id: runId,
              skill_id: finding.skill_id,
              finding_id: finding.finding_id,
              severity: finding.severity,
              risk_score: finding.risk_score,
              confidence_score: finding.confidence_score,
            });
          }
        }

        await this.repo.updateExecution(executionId, {
          status: "success",
          ended_at: nowIso(),
          execution_mode: result.executionMode,
          tool_usage: result.toolUsage,
          raw_provider_output: result.rawProviderOutput,
        });

        this.analytics.capture("skill_execution_completed", {
          run_id: runId,
          skill_id: skillPkg.manifest.skill_id,
          version: skillPkg.manifest.version,
          execution_mode: result.executionMode,
          mcp_mode: result.mcpMode,
          finding_count: result.findings.length,
        });
      } catch (error) {
        await this.repo.updateExecution(executionId, {
          status: "failed",
          ended_at: nowIso(),
          error: (error as Error).message,
        });

        this.analytics.capture("skill_execution_failed", {
          run_id: runId,
          skill_id: skillPkg.manifest.skill_id,
          version: skillPkg.manifest.version,
          error: (error as Error).message,
        });
      }
    }

    await this.repo.updateRun(runId, {
      status: "completed",
      ended_at: nowIso(),
    });

    this.analytics.capture("close_run_completed", {
      run_id: runId,
      client_id: parsed.client_id,
    });

    return { run_id: runId, status: "completed" };
  }
}
