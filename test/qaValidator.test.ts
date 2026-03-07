import { describe, expect, test } from "vitest";
import { QaValidator } from "../src/services/qaValidator.js";

const qa = new QaValidator();

describe("qa validator", () => {
  test("passes strong finding", () => {
    const result = qa.validate({
      finding_id: "f1",
      skill_id: "skill_1",
      entity_type: "transaction",
      entity_ref: "txn_1",
      severity: "high",
      risk_score: 85,
      confidence_score: 70,
      summary: "Issue",
      rationale: "Why",
      recommended_action: "Do",
      evidence: ["fact"],
      requires_human_review: true,
    });

    expect(result.status).toBe("pass");
  });

  test("flags low confidence as needs_review", () => {
    const result = qa.validate({
      finding_id: "f2",
      skill_id: "skill_1",
      entity_type: "transaction",
      entity_ref: "txn_2",
      severity: "high",
      risk_score: 90,
      confidence_score: 30,
      summary: "Issue",
      rationale: "Why",
      recommended_action: "Do",
      evidence: ["fact"],
      requires_human_review: true,
    });

    expect(result.status).toBe("needs_review");
  });
});
