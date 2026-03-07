import crypto from "node:crypto";

export function makeId(prefix: string): string {
  const suffix = crypto.randomBytes(6).toString("hex");
  return `${prefix}_${suffix}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
