import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { createDbConnection, type DbConnection } from "../src/db/connection";
import { DEFAULT_SECTIONS } from "../src/db/default-sections";
import { listSections } from "../src/db/repositories";
import { sections } from "../src/db/schema";
import { seedDefaultSections } from "../src/db/seed";

const tempDirs: string[] = [];

function createMigratedDb(): DbConnection {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ingredient-db-seed-"));
  const dbPath = path.join(tempDir, "test.db");
  tempDirs.push(tempDir);

  const connection = createDbConnection(dbPath);
  migrate(connection.db, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle")
  });

  return connection;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (!tempDir) {
      continue;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("default section seed", () => {
  it("loads the full default store layout with expected walk order", async () => {
    const connection = createMigratedDb();
    await seedDefaultSections(connection.db);

    const sectionRows = await listSections(connection.db);
    expect(sectionRows).toHaveLength(DEFAULT_SECTIONS.length);
    expect(
      sectionRows.map((section) => ({
        id: section.id,
        name: section.name,
        sortOrder: section.sortOrder,
        subcategories: section.subcategories
      }))
    ).toEqual(DEFAULT_SECTIONS);

    connection.sqlite.close();
  });

  it("is idempotent across repeated runs and repairs drifted values", async () => {
    const connection = createMigratedDb();

    await seedDefaultSections(connection.db);
    connection.db
      .update(sections)
      .set({ sortOrder: 99, subcategories: [] })
      .where(eq(sections.id, "section-produce"))
      .run();
    await seedDefaultSections(connection.db);

    const sectionRows = await listSections(connection.db);
    expect(sectionRows).toHaveLength(DEFAULT_SECTIONS.length);

    const produce = sectionRows.find((section) => section.id === "section-produce");
    expect(produce).toEqual(
      expect.objectContaining({
        name: "Produce",
        sortOrder: 1,
        subcategories: ["Fruits", "Vegetables", "Herbs"]
      })
    );

    const uniqueIds = new Set(sectionRows.map((section) => section.id));
    expect(uniqueIds.size).toBe(DEFAULT_SECTIONS.length);

    connection.sqlite.close();
  });
});
