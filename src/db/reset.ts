import fs from "node:fs";
import { resolveDbFilePath } from "./connection";
import { runMigrations } from "./migrate";
import { runSeed } from "./seed";

async function resetDb() {
  const dbFilePath = resolveDbFilePath();
  fs.rmSync(dbFilePath, { force: true });

  runMigrations();
  const seededCount = await runSeed();
  process.stdout.write(`Database reset at ${dbFilePath}. Seeded ${seededCount} sections.\n`);
}

resetDb();
