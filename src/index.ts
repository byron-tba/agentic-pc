import { createApp } from "./app.js";
import { config } from "./config.js";

const { app, analytics } = createApp();

const server = app.listen(config.port, () => {
  console.log(`Prototype API listening on port ${config.port}`);
});

async function shutdown() {
  await analytics.shutdown();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
