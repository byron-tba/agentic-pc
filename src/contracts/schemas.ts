import { z } from "zod";

function isStrictIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((value) => isStrictIsoDate(value), "Invalid calendar date");

export const SeveritySchema = z.enum(["low", "medium", "high"]);
export const EntityTypeSchema = z.enum([
  "transaction",
  "account",
  "vendor",
  "reconciliation",
]);
export const ReviewDecisionSchema = z.enum([
  "accept",
  "reject",
  "needs_review",
  "add_note",
]);

export const FindingSchema = z.object({
  finding_id: z.string(),
  skill_id: z.string(),
  entity_type: EntityTypeSchema,
  entity_ref: z.string(),
  severity: SeveritySchema,
  risk_score: z.number().int().min(0).max(100),
  confidence_score: z.number().int().min(0).max(100),
  summary: z.string().min(1),
  rationale: z.string().min(1),
  recommended_action: z.string().min(1),
  evidence: z.array(z.string()).min(1),
  requires_human_review: z.boolean(),
});

export const QaStatusSchema = z.enum(["pass", "fail", "needs_review"]);
export const QaResultSchema = z.object({
  finding_id: z.string(),
  status: QaStatusSchema,
  reasons: z.array(z.string()),
});

export const CloseRunRequestSchema = z
  .object({
    client_id: z.string().min(1),
    period_start: IsoDateSchema,
    period_end: IsoDateSchema,
    skill_ids: z.array(z.string()).optional(),
  })
  .refine((value) => value.period_end >= value.period_start, {
    message: "period_end must be on or after period_start",
    path: ["period_end"],
  });

export const SkillManifestSchema = z.object({
  skill_id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  owner: z.string().min(1),
  tags: z.array(z.string()),
  status: z.enum(["active", "archived"]),
  required_inputs: z.array(z.string()),
  optional_inputs: z.array(z.string()).default([]),
  required_mcp_tools: z.array(z.string()),
  expected_evidence_requirements: z.array(z.string()),
  safety_notes: z.array(z.string()),
});

export const SkillExecutionContextSchema = z.object({
  client_id: z.string(),
  period_start: IsoDateSchema,
  period_end: IsoDateSchema,
  run_id: z.string().optional(),
  input: z.record(z.unknown()).default({}),
});

export const McpToolRequestSchema = z.object({
  tool: z.string(),
  client_id: z.string(),
  params: z.record(z.unknown()),
});

export const McpToolResponseSchema = z.object({
  tool: z.string(),
  ok: z.boolean(),
  data: z.unknown(),
  error: z.string().optional(),
});

export const ExecutionLogSchema = z.object({
  run_id: z.string(),
  skill_id: z.string(),
  version: z.string(),
  status: z.enum(["started", "success", "failed", "qa_failed"]),
  execution_mode: z.enum(["claude", "fixture"]),
  started_at: z.string(),
  ended_at: z.string().optional(),
  tool_usage: z.array(z.string()).default([]),
  raw_provider_output: z.unknown().optional(),
  error: z.string().optional(),
});

export const ReviewDecisionPayloadSchema = z.object({
  decision: ReviewDecisionSchema,
  note: z.string().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;
export type QaResult = z.infer<typeof QaResultSchema>;
export type CloseRunRequest = z.infer<typeof CloseRunRequestSchema>;
export type SkillManifest = z.infer<typeof SkillManifestSchema>;
export type SkillExecutionContext = z.infer<typeof SkillExecutionContextSchema>;
export type McpToolRequest = z.infer<typeof McpToolRequestSchema>;
export type McpToolResponse = z.infer<typeof McpToolResponseSchema>;
export type ExecutionLog = z.infer<typeof ExecutionLogSchema>;
export type ReviewDecisionPayload = z.infer<typeof ReviewDecisionPayloadSchema>;
