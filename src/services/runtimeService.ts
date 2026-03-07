import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ClaudeSkillsAdapter } from "../adapters/claude.js";
import { FindingSchema, type Finding, type SkillExecutionContext } from "../contracts/schemas.js";
import type { Repository } from "../db/repository.js";
import { makeId, nowIso } from "../utils.js";
import { QboMcpAdapter } from "./mcpAdapter.js";
import { SkillsService } from "./skillsService.js";

export type SkillRunResult = {
  findings: Finding[];
  executionMode: "claude" | "fixture";
  rawProviderOutput: unknown;
  toolUsage: string[];
};

export class RuntimeService {
  constructor(
    private readonly repo: Repository,
    private readonly skillsService: SkillsService,
    private readonly claude: ClaudeSkillsAdapter,
    private readonly mcp: QboMcpAdapter,
  ) {}

  async executeSkill(skillId: string, version: string, context: SkillExecutionContext): Promise<SkillRunResult> {
    const providerSkillId = await this.skillsService.ensureRegistered(skillId, version);

    try {
      const claudeResult = await this.claude.executeSkill(providerSkillId, context);
      const findings = this.normalizeFindings(skillId, claudeResult.findings);
      return {
        findings,
        executionMode: "claude",
        rawProviderOutput: claudeResult.rawOutput,
        toolUsage: ["provider_skill_execute"],
      };
    } catch (error) {
      const fallback = await this.runFixture(skillId, version, context);
      return {
        findings: fallback,
        executionMode: "fixture",
        rawProviderOutput: { error: (error as Error).message, fallback: true },
        toolUsage: ["get_transactions", "get_accounts", "get_reconciliations"],
      };
    }
  }

  private normalizeFindings(skillId: string, rawFindings: unknown[]): Finding[] {
    return rawFindings.map((raw) => {
      const obj = raw as Partial<Finding>;
      const normalized: Finding = {
        finding_id: obj.finding_id ?? makeId("finding"),
        skill_id: obj.skill_id ?? skillId,
        entity_type: obj.entity_type ?? "transaction",
        entity_ref: obj.entity_ref ?? "unknown",
        severity: obj.severity ?? "medium",
        risk_score: obj.risk_score ?? 50,
        confidence_score: obj.confidence_score ?? 60,
        summary: obj.summary ?? "Unspecified finding",
        rationale: obj.rationale ?? "No rationale provided",
        recommended_action: obj.recommended_action ?? "Review manually",
        evidence: obj.evidence ?? ["Provider response"],
        requires_human_review: obj.requires_human_review ?? true,
      };
      return FindingSchema.parse(normalized);
    });
  }

  private async runFixture(skillId: string, version: string, context: SkillExecutionContext): Promise<Finding[]> {
    const pkgPath = path.join(process.cwd(), "skills", skillId, version, "fixtures", "expected_output.json");
    const qboTransactions = await this.mcp.callTool({
      tool: "get_transactions",
      client_id: context.client_id,
      params: {},
    });
    const qboAccounts = await this.mcp.callTool({
      tool: "get_accounts",
      client_id: context.client_id,
      params: {},
    });
    const qboReconciliations = await this.mcp.callTool({
      tool: "get_reconciliations",
      client_id: context.client_id,
      params: {},
    });

    const hasFixture = await readFile(pkgPath, "utf8").then(
      (raw) => JSON.parse(raw) as { findings: Finding[] },
      () => null,
    );

    if (hasFixture?.findings?.length) {
      return hasFixture.findings.map((finding) =>
        FindingSchema.parse({
          ...finding,
          finding_id: makeId("finding"),
          skill_id: skillId,
        }),
      );
    }

    const txns = (qboTransactions.data as any[]) ?? [];
    const accounts = (qboAccounts.data as any[]) ?? [];
    const recs = (qboReconciliations.data as any[]) ?? [];

    const generated: Finding[] = [];
    if (skillId === "unreconciled-transactions") {
      txns
        .filter((txn) => txn.reconciled === false)
        .forEach((txn) => {
          generated.push(
            FindingSchema.parse({
              finding_id: makeId("finding"),
              skill_id: skillId,
              entity_type: "transaction",
              entity_ref: txn.id,
              severity: "high",
              risk_score: 85,
              confidence_score: 78,
              summary: "Transaction remains unreconciled for active period",
              rationale: `Transaction ${txn.id} is unreconciled in the selected close period.`,
              recommended_action: "Investigate bank match and reconcile item before close.",
              evidence: [`account:${txn.account}`, `date:${txn.date}`],
              requires_human_review: true,
            }),
          );
        });
    }

    if (skillId === "suspicious-classifications") {
      txns
        .filter((txn) => txn.category === "Uncategorized" || txn.vendor === "Unknown")
        .forEach((txn) => {
          generated.push(
            FindingSchema.parse({
              finding_id: makeId("finding"),
              skill_id: skillId,
              entity_type: "transaction",
              entity_ref: txn.id,
              severity: "medium",
              risk_score: 70,
              confidence_score: 74,
              summary: "Transaction has suspicious classification",
              rationale: `Transaction ${txn.id} is uncategorized or has unknown counterparty metadata.`,
              recommended_action: "Classify transaction and confirm vendor coding.",
              evidence: [`category:${txn.category}`, `vendor:${txn.vendor}`],
              requires_human_review: true,
            }),
          );
        });
    }

    if (skillId === "missing-required-details") {
      txns
        .filter((txn) => !txn.description || !txn.vendor)
        .forEach((txn) => {
          generated.push(
            FindingSchema.parse({
              finding_id: makeId("finding"),
              skill_id: skillId,
              entity_type: "transaction",
              entity_ref: txn.id,
              severity: "medium",
              risk_score: 65,
              confidence_score: 72,
              summary: "Transaction is missing required details",
              rationale: `Transaction ${txn.id} is missing description or vendor details.`,
              recommended_action: "Fill required fields and attach support.",
              evidence: [`description:${txn.description ?? ""}`, `vendor:${txn.vendor ?? ""}`],
              requires_human_review: true,
            }),
          );
        });
    }

    if (skillId === "balance-sheet-vs-expense") {
      txns
        .filter((txn) => txn.account === "Prepaid Expenses" && txn.type === "expense")
        .forEach((txn) => {
          generated.push(
            FindingSchema.parse({
              finding_id: makeId("finding"),
              skill_id: skillId,
              entity_type: "account",
              entity_ref: txn.account,
              severity: "high",
              risk_score: 82,
              confidence_score: 76,
              summary: "Possible balance-sheet vs expense misclassification",
              rationale: `Expense posted to ${txn.account} may require asset treatment review.`,
              recommended_action: "Review capitalization policy and reclass if needed.",
              evidence: [`transaction:${txn.id}`, `amount:${txn.amount}`],
              requires_human_review: true,
            }),
          );
        });
    }

    if (skillId === "period-close-anomalies") {
      accounts
        .filter((acct) => ["Suspense", "Uncleared Checks"].includes(acct.name))
        .forEach((acct) => {
          generated.push(
            FindingSchema.parse({
              finding_id: makeId("finding"),
              skill_id: skillId,
              entity_type: "account",
              entity_ref: acct.name,
              severity: "high",
              risk_score: 88,
              confidence_score: 80,
              summary: "Stale close-period account balance detected",
              rationale: `${acct.name} retains balance that can indicate unresolved close items.`,
              recommended_action: "Investigate outstanding entries and clear before final close.",
              evidence: [`balance:${acct.balance}`, `last_activity:${acct.last_activity}`],
              requires_human_review: true,
            }),
          );
        });
      recs
        .filter((rec) => rec.status !== "closed")
        .forEach((rec) => {
          generated.push(
            FindingSchema.parse({
              finding_id: makeId("finding"),
              skill_id: skillId,
              entity_type: "reconciliation",
              entity_ref: rec.account,
              severity: "high",
              risk_score: 85,
              confidence_score: 79,
              summary: "Open reconciliation remains at period close",
              rationale: `${rec.account} reconciliation is still open with unreconciled items.`,
              recommended_action: "Complete reconciliation and resolve uncleared lines.",
              evidence: [`period:${rec.period}`, `unreconciled_count:${rec.unreconciled_count}`],
              requires_human_review: true,
            }),
          );
        });
    }

    if (generated.length === 0) {
      generated.push(
        FindingSchema.parse({
          finding_id: makeId("finding"),
          skill_id: skillId,
          entity_type: "transaction",
          entity_ref: "none",
          severity: "low",
          risk_score: 15,
          confidence_score: 70,
          summary: "No anomalies found in fixture run",
          rationale: "Fixture evaluation did not meet anomaly thresholds.",
          recommended_action: "Proceed with manual spot check.",
          evidence: ["fixture-run"],
          requires_human_review: true,
        }),
      );
    }

    return generated;
  }
}
