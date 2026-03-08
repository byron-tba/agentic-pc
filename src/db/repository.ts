import type { Pool } from "pg";
import type { ExecutionLog, Finding, QaResult, ReviewDecisionPayload, SkillManifest } from "../contracts/schemas.js";
import { makeId, nowIso } from "../utils.js";

type RunRecord = {
  run_id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  status: string;
  started_at: string;
  ended_at?: string;
  error?: string;
};

type SkillRegistration = {
  skill_id: string;
  version: string;
  provider_skill_id: string | null;
  status: string;
  manifest: SkillManifest;
};

type FindingRecord = {
  finding_id: string;
  run_id: string;
  skill_id: string;
  payload: Finding;
  qa_status: string;
  qa_reasons: string[];
};

type FindingRow = {
  finding_id: string;
  run_id: string;
  skill_id: string;
  payload: Finding;
  qa_status: string;
  qa_reasons: string[];
};

export interface Repository {
  upsertClient(clientId: string, name: string): Promise<void>;
  createRun(run: RunRecord): Promise<void>;
  updateRun(runId: string, patch: Partial<RunRecord>): Promise<void>;
  getRun(runId: string): Promise<RunRecord | null>;
  saveSkillRegistration(reg: SkillRegistration): Promise<void>;
  getSkillRegistration(skillId: string, version: string): Promise<SkillRegistration | null>;
  createExecution(log: ExecutionLog): Promise<string>;
  updateExecution(executionId: string, patch: Partial<ExecutionLog>): Promise<void>;
  saveFinding(runId: string, finding: Finding, qaResult: QaResult): Promise<void>;
  getFindingsByRun(runId: string): Promise<FindingRecord[]>;
  saveReviewDecision(findingId: string, payload: ReviewDecisionPayload): Promise<{ decision_id: string }>;
}

export class InMemoryRepository implements Repository {
  private clients = new Map<string, string>();
  private runs = new Map<string, RunRecord>();
  private regs = new Map<string, SkillRegistration>();
  private executions = new Map<string, ExecutionLog>();
  private findings = new Map<string, FindingRecord>();

  async upsertClient(clientId: string, name: string): Promise<void> {
    this.clients.set(clientId, name);
  }

  async createRun(run: RunRecord): Promise<void> {
    this.runs.set(run.run_id, run);
  }

  async updateRun(runId: string, patch: Partial<RunRecord>): Promise<void> {
    const prev = this.runs.get(runId);
    if (!prev) {
      return;
    }
    this.runs.set(runId, { ...prev, ...patch });
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    return this.runs.get(runId) ?? null;
  }

  async saveSkillRegistration(reg: SkillRegistration): Promise<void> {
    this.regs.set(`${reg.skill_id}:${reg.version}`, reg);
  }

  async getSkillRegistration(skillId: string, version: string): Promise<SkillRegistration | null> {
    return this.regs.get(`${skillId}:${version}`) ?? null;
  }

  async createExecution(log: ExecutionLog): Promise<string> {
    const executionId = makeId("exec");
    this.executions.set(executionId, log);
    return executionId;
  }

  async updateExecution(executionId: string, patch: Partial<ExecutionLog>): Promise<void> {
    const prev = this.executions.get(executionId);
    if (!prev) {
      return;
    }
    this.executions.set(executionId, { ...prev, ...patch });
  }

  async saveFinding(runId: string, finding: Finding, qaResult: QaResult): Promise<void> {
    this.findings.set(finding.finding_id, {
      finding_id: finding.finding_id,
      run_id: runId,
      skill_id: finding.skill_id,
      payload: finding,
      qa_status: qaResult.status,
      qa_reasons: qaResult.reasons,
    });
  }

  async getFindingsByRun(runId: string): Promise<FindingRecord[]> {
    return [...this.findings.values()].filter((item) => item.run_id === runId);
  }

  async saveReviewDecision(findingId: string, payload: ReviewDecisionPayload): Promise<{ decision_id: string }> {
    const decisionId = makeId("decision");
    const finding = this.findings.get(findingId);
    if (!finding) {
      throw new Error("Finding not found");
    }
    finding.qa_reasons = [...finding.qa_reasons, `${payload.decision}:${payload.note ?? ""}`];
    return { decision_id: decisionId };
  }
}

export class PgRepository implements Repository {
  constructor(private readonly pool: Pool) {}

  async upsertClient(clientId: string, name: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO clients (client_id, name) VALUES ($1, $2)
       ON CONFLICT (client_id) DO UPDATE SET name = EXCLUDED.name`,
      [clientId, name],
    );
  }

  async createRun(run: RunRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO close_runs (run_id, client_id, period_start, period_end, status, started_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [run.run_id, run.client_id, run.period_start, run.period_end, run.status, run.started_at],
    );
  }

  async updateRun(runId: string, patch: Partial<RunRecord>): Promise<void> {
    const current = await this.getRun(runId);
    if (!current) {
      return;
    }
    const next = { ...current, ...patch };
    await this.pool.query(
      `UPDATE close_runs SET status = $2, ended_at = $3, error = $4 WHERE run_id = $1`,
      [runId, next.status, next.ended_at ?? null, next.error ?? null],
    );
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const res = await this.pool.query("SELECT * FROM close_runs WHERE run_id = $1", [runId]);
    return (res.rows[0] as RunRecord | undefined) ?? null;
  }

  async saveSkillRegistration(reg: SkillRegistration): Promise<void> {
    await this.pool.query(
      `INSERT INTO skill_registrations (skill_id, version, provider_skill_id, status, manifest)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (skill_id, version)
       DO UPDATE SET provider_skill_id = EXCLUDED.provider_skill_id, status = EXCLUDED.status, manifest = EXCLUDED.manifest`,
      [reg.skill_id, reg.version, reg.provider_skill_id, reg.status, JSON.stringify(reg.manifest)],
    );
  }

  async getSkillRegistration(skillId: string, version: string): Promise<SkillRegistration | null> {
    const res = await this.pool.query(
      "SELECT skill_id, version, provider_skill_id, status, manifest FROM skill_registrations WHERE skill_id = $1 AND version = $2",
      [skillId, version],
    );
    if (!res.rows[0]) {
      return null;
    }
    return {
      ...res.rows[0],
      manifest: res.rows[0].manifest,
    } as SkillRegistration;
  }

  async createExecution(log: ExecutionLog): Promise<string> {
    const executionId = makeId("exec");
    await this.pool.query(
      `INSERT INTO skill_executions
       (execution_id, run_id, skill_id, version, status, execution_mode, started_at, ended_at, tool_usage, raw_provider_output, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        executionId,
        log.run_id,
        log.skill_id,
        log.version,
        log.status,
        log.execution_mode,
        log.started_at,
        log.ended_at ?? null,
        JSON.stringify(log.tool_usage),
        JSON.stringify(log.raw_provider_output ?? null),
        log.error ?? null,
      ],
    );
    return executionId;
  }

  async updateExecution(executionId: string, patch: Partial<ExecutionLog>): Promise<void> {
    const res = await this.pool.query("SELECT * FROM skill_executions WHERE execution_id = $1", [executionId]);
    const current = res.rows[0] as ExecutionLog | undefined;
    if (!current) {
      return;
    }
    const next = { ...current, ...patch };
    await this.pool.query(
      `UPDATE skill_executions SET status = $2, ended_at = $3, tool_usage = $4, raw_provider_output = $5, error = $6 WHERE execution_id = $1`,
      [
        executionId,
        next.status,
        next.ended_at ?? null,
        JSON.stringify(next.tool_usage ?? []),
        JSON.stringify(next.raw_provider_output ?? null),
        next.error ?? null,
      ],
    );
  }

  async saveFinding(runId: string, finding: Finding, qaResult: QaResult): Promise<void> {
    await this.pool.query(
      `INSERT INTO findings (finding_id, run_id, skill_id, payload, qa_status, qa_reasons)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        finding.finding_id,
        runId,
        finding.skill_id,
        JSON.stringify(finding),
        qaResult.status,
        JSON.stringify(qaResult.reasons),
      ],
    );
  }

  async getFindingsByRun(runId: string): Promise<FindingRecord[]> {
    const res = await this.pool.query("SELECT * FROM findings WHERE run_id = $1 ORDER BY created_at ASC", [runId]);
    return res.rows.map((row: FindingRow) => ({
      finding_id: row.finding_id,
      run_id: row.run_id,
      skill_id: row.skill_id,
      payload: row.payload,
      qa_status: row.qa_status,
      qa_reasons: row.qa_reasons,
    }));
  }

  async saveReviewDecision(findingId: string, payload: ReviewDecisionPayload): Promise<{ decision_id: string }> {
    const decisionId = makeId("decision");
    await this.pool.query(
      `INSERT INTO review_decisions (decision_id, finding_id, decision, note, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [decisionId, findingId, payload.decision, payload.note ?? null, nowIso()],
    );
    return { decision_id: decisionId };
  }
}
