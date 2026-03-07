import { Pool } from "pg";
import { config } from "../config.js";

let pool: Pool | null = null;

export function getPool(): Pool | null {
  if (!config.databaseUrl) {
    return null;
  }
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}
