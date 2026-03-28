import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDbConnection } from "./connection";

export function runMigrations() {
  const connection = createDbConnection();

  try {
    migrate(connection.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle")
    });
  } finally {
    connection.sqlite.close();
  }
}

if (require.main === module) {
  runMigrations();
}
