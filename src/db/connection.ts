import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type IngredientDb = BetterSQLite3Database<typeof schema>;

export type DbConnection = {
  sqlite: Database.Database;
  db: IngredientDb;
};

let singletonConnection: DbConnection | undefined;

export function resolveDbFilePath() {
  return process.env.DB_FILE ?? path.resolve(process.cwd(), "ingredient.db");
}

export function createDbConnection(dbFilePath = resolveDbFilePath()): DbConnection {
  const dbDirectory = path.dirname(dbFilePath);
  fs.mkdirSync(dbDirectory, { recursive: true });

  const sqlite = new Database(dbFilePath);
  sqlite.pragma("foreign_keys = ON");

  return {
    sqlite,
    db: drizzle(sqlite, { schema })
  };
}

export function getDbConnection() {
  if (!singletonConnection) {
    singletonConnection = createDbConnection();
  }

  return singletonConnection;
}

export function closeDbConnection() {
  singletonConnection?.sqlite.close();
  singletonConnection = undefined;
}
