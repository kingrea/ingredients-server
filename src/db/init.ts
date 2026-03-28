import { runMigrations } from "./migrate";
import { runSeed } from "./seed";

async function initDb() {
  runMigrations();
  const seededCount = await runSeed();
  process.stdout.write(`Database initialized. Seeded ${seededCount} sections.\n`);
}

initDb();
