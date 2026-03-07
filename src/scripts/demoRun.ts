import { ClaudeSkillsAdapter } from "../adapters/claude.js";
import { Analytics } from "../adapters/posthog.js";
import { InMemoryRepository } from "../db/repository.js";
import { QboMcpAdapter } from "../services/mcpAdapter.js";
import { RunOrchestrator } from "../services/orchestrator.js";
import { QaValidator } from "../services/qaValidator.js";
import { RuntimeService } from "../services/runtimeService.js";
import { SkillsService } from "../services/skillsService.js";

async function main() {
  const repo = new InMemoryRepository();
  const analytics = new Analytics();
  const claude = new ClaudeSkillsAdapter();
  const mcp = new QboMcpAdapter();
  const skills = new SkillsService(repo, claude);
  const runtime = new RuntimeService(repo, skills, claude, mcp);
  const qa = new QaValidator();
  const orchestrator = new RunOrchestrator(repo, skills, runtime, qa, analytics);

  const run = await orchestrator.runClose({
    client_id: "client_demo",
    period_start: "2026-02-01",
    period_end: "2026-02-29",
  });

  const findings = await repo.getFindingsByRun(run.run_id);
  console.log(JSON.stringify({ run, findings }, null, 2));

  await analytics.shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
