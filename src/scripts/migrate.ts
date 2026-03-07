import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPool } from "../db/client.js";

async function main() {
  const pool = getPool();
  if (!pool) {
    throw new Error("DATABASE_URL is required for migration");
  }
  const sql = await readFile(path.join(process.cwd(), "src", "db", "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Migration complete");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
