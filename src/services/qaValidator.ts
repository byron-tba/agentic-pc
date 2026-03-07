import { FindingSchema, type Finding, type QaResult } from "../contracts/schemas.js";

export class QaValidator {
  validate(finding: Finding): QaResult {
    const parsed = FindingSchema.safeParse(finding);
    if (!parsed.success) {
      return {
        finding_id: finding.finding_id,
        status: "fail",
        reasons: parsed.error.issues.map((issue) => issue.message),
      };
    }

    const reasons: string[] = [];
    if (finding.confidence_score < 40) {
      reasons.push("Confidence below floor");
    }
    if (finding.evidence.length < 1) {
      reasons.push("Missing evidence");
    }
    if (finding.risk_score > 80 && finding.severity === "low") {
      reasons.push("Risk/severity contradiction");
    }

    if (reasons.length === 0) {
      return { finding_id: finding.finding_id, status: "pass", reasons: [] };
    }

    const status = reasons.includes("Confidence below floor") ? "needs_review" : "fail";
    return { finding_id: finding.finding_id, status, reasons };
  }
}
