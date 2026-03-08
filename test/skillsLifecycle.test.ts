import { describe, expect, test } from "vitest";
import { ClaudeSkillsAdapter } from "../src/adapters/claude.js";
import { InMemoryRepository } from "../src/db/repository.js";
import { SkillsService } from "../src/services/skillsService.js";

describe("skills lifecycle", () => {
  test("create, update, archive and metadata", async () => {
    const repo = new InMemoryRepository();
    const skills = new SkillsService(repo, new ClaudeSkillsAdapter());

    const created = await skills.createSkill("unreconciled-transactions", "v1");
    expect(created.providerSkillId).toBeTruthy();

    const updated = await skills.updateSkill("unreconciled-transactions", "v1");
    expect(updated.providerSkillId).toBeTruthy();

    const metadata = await skills.fetchSkillMetadata("unreconciled-transactions", "v1");
    expect(metadata.skill_id).toBe("unreconciled-transactions");

    await skills.archiveSkillVersion("unreconciled-transactions", "v1");

    const registration = await repo.getSkillRegistration("unreconciled-transactions", "v1");
    expect(registration?.status).toBe("archived");
    expect(registration?.manifest.status).toBe("archived");
  });
});
