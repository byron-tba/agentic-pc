import { getPool } from "../db/client.js";

async function main() {
  const pool = getPool();
  if (!pool) {
    throw new Error("DATABASE_URL is required for seed");
  }
  await pool.query(
    `INSERT INTO clients (client_id, name) VALUES ('client_demo', 'Demo Client')
     ON CONFLICT (client_id) DO UPDATE SET name = EXCLUDED.name`,
  );
  console.log("Seed complete");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
