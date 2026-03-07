import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { SkillManifestSchema, type SkillManifest } from "../contracts/schemas.js";
import type { Repository } from "../db/repository.js";
import { ClaudeSkillsAdapter, loadSkillInstructions } from "../adapters/claude.js";

export type SkillPackage = {
  manifest: SkillManifest;
  rootPath: string;
};

export class SkillsService {
  constructor(
    private readonly repo: Repository,
    private readonly claudeAdapter: ClaudeSkillsAdapter,
    private readonly skillsRoot = path.join(process.cwd(), "skills"),
  ) {}

  async listSkillPackages(): Promise<SkillPackage[]> {
    const skillDirs = await readdir(this.skillsRoot, { withFileTypes: true });
    const results: SkillPackage[] = [];
    for (const skillDir of skillDirs) {
      if (!skillDir.isDirectory()) {
        continue;
      }
      const versionsRoot = path.join(this.skillsRoot, skillDir.name);
      const versionDirs = await readdir(versionsRoot, { withFileTypes: true });
      for (const versionDir of versionDirs) {
        if (!versionDir.isDirectory()) {
          continue;
        }
        const rootPath = path.join(versionsRoot, versionDir.name);
        const manifestPath = path.join(rootPath, "manifest.json");
        const rawManifest = await readFile(manifestPath, "utf8");
        const manifest = SkillManifestSchema.parse(JSON.parse(rawManifest));
        results.push({ manifest, rootPath });
      }
    }
    return results;
  }

  async getSkillPackage(skillId: string, version: string): Promise<SkillPackage> {
    const rootPath = path.join(this.skillsRoot, skillId, version);
    const manifestPath = path.join(rootPath, "manifest.json");
    const rawManifest = await readFile(manifestPath, "utf8");
    const manifest = SkillManifestSchema.parse(JSON.parse(rawManifest));
    return { manifest, rootPath };
  }

  async fetchSkillMetadata(skillId: string, version: string): Promise<SkillManifest> {
    const skillPackage = await this.getSkillPackage(skillId, version);
    return skillPackage.manifest;
  }

  async createSkill(skillId: string, version: string): Promise<{ providerSkillId: string | null }> {
    const skillPackage = await this.getSkillPackage(skillId, version);
    const instructions = await loadSkillInstructions(skillPackage.rootPath);
    const registration = await this.claudeAdapter.registerSkill(skillPackage.manifest, instructions);

    await this.repo.saveSkillRegistration({
      skill_id: skillPackage.manifest.skill_id,
      version: skillPackage.manifest.version,
      provider_skill_id: registration.providerSkillId,
      status: skillPackage.manifest.status,
      manifest: skillPackage.manifest,
    });

    return { providerSkillId: registration.providerSkillId };
  }

  async updateSkill(skillId: string, version: string): Promise<{ providerSkillId: string | null }> {
    return this.createSkill(skillId, version);
  }

  async archiveSkillVersion(skillId: string, version: string): Promise<void> {
    const existing = await this.repo.getSkillRegistration(skillId, version);
    if (!existing) {
      return;
    }
    await this.repo.saveSkillRegistration({
      ...existing,
      status: "archived",
      manifest: {
        ...existing.manifest,
        status: "archived",
      },
    });
  }

  async registerSkill(skillId: string, version: string): Promise<{ providerSkillId: string | null }> {
    return this.createSkill(skillId, version);
  }

  async ensureRegistered(skillId: string, version: string): Promise<string> {
    const existing = await this.repo.getSkillRegistration(skillId, version);
    if (existing?.provider_skill_id) {
      return existing.provider_skill_id;
    }

    const registered = await this.registerSkill(skillId, version);
    return registered.providerSkillId ?? `${skillId}_${version}`;
  }
}
