import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDbConnection, type DbConnection } from "../src/db/connection";
import { RepositoryConstraintError } from "../src/db/constraint-errors";
import {
  createAlias,
  createIngredient,
  createSection,
  deleteAlias,
  deleteIngredient,
  deleteSection,
  getAliasByValue,
  getIngredientById,
  getSectionById,
  listAliases,
  listIngredients,
  listSections,
  updateAlias,
  updateIngredient,
  updateSection
} from "../src/db/repositories";

const tempDirs: string[] = [];

function createMigratedDb(): DbConnection {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ingredient-db-"));
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

describe("db connection", () => {
  it("enables foreign key enforcement", () => {
    const connection = createMigratedDb();
    const row = connection.sqlite.prepare("PRAGMA foreign_keys").get() as {
      foreign_keys: number;
    };

    connection.sqlite.close();
    expect(row.foreign_keys).toBe(1);
  });
});

describe("repositories", () => {
  it("supports CRUD across sections, ingredients, and aliases", async () => {
    const connection = createMigratedDb();

    await createSection(connection.db, {
      id: "section-produce",
      name: "Produce",
      sortOrder: 1,
      subcategories: ["Herbs"]
    });
    await createSection(connection.db, {
      id: "section-pantry",
      name: "Pantry",
      sortOrder: 2,
      subcategories: []
    });

    const section = await getSectionById(connection.db, "section-produce");
    expect(section?.name).toBe("Produce");

    await updateSection(connection.db, "section-produce", {
      subcategories: ["Herbs", "Leafy Greens"]
    });
    const updatedSection = await getSectionById(connection.db, "section-produce");
    expect(updatedSection?.subcategories).toEqual(["Herbs", "Leafy Greens"]);

    await createIngredient(connection.db, {
      id: "ingredient-basil",
      name: "Basil",
      sectionId: "section-produce"
    });
    await updateIngredient(connection.db, "ingredient-basil", {
      sectionId: "section-pantry"
    });

    const ingredient = await getIngredientById(connection.db, "ingredient-basil");
    expect(ingredient?.sectionId).toBe("section-pantry");

    await createAlias(connection.db, {
      id: "alias-sweet-basil",
      alias: "Sweet Basil",
      ingredientId: "ingredient-basil"
    });

    await updateAlias(connection.db, "alias-sweet-basil", {
      alias: "Genovese Basil"
    });

    const alias = await getAliasByValue(connection.db, "Genovese Basil");
    expect(alias?.ingredientId).toBe("ingredient-basil");

    await expect(listSections(connection.db)).resolves.toHaveLength(2);
    await expect(listIngredients(connection.db, "section-pantry")).resolves.toHaveLength(1);
    await expect(listAliases(connection.db, "ingredient-basil")).resolves.toHaveLength(1);

    await expect(deleteAlias(connection.db, "alias-sweet-basil")).resolves.toBe(true);
    await expect(deleteIngredient(connection.db, "ingredient-basil")).resolves.toBe(true);
    await expect(deleteSection(connection.db, "section-pantry")).resolves.toBe(true);

    connection.sqlite.close();
  });

  it("maps foreign key and duplicate alias constraints", async () => {
    const connection = createMigratedDb();

    await createSection(connection.db, {
      id: "section-produce",
      name: "Produce",
      sortOrder: 1,
      subcategories: []
    });
    await createIngredient(connection.db, {
      id: "ingredient-basil",
      name: "Basil",
      sectionId: "section-produce"
    });
    await createIngredient(connection.db, {
      id: "ingredient-thyme",
      name: "Thyme",
      sectionId: "section-produce"
    });
    await createAlias(connection.db, {
      id: "alias-basil",
      alias: "Basil",
      ingredientId: "ingredient-basil"
    });

    await expect(
      createIngredient(connection.db, {
        id: "ingredient-ghost",
        name: "Ghost",
        sectionId: "missing-section"
      })
    ).rejects.toMatchObject({
      detail: {
        type: "invalid_section_id",
        sectionId: "missing-section"
      }
    });

    await expect(
      createAlias(connection.db, {
        id: "alias-basil-2",
        alias: "Basil",
        ingredientId: "ingredient-thyme"
      })
    ).rejects.toMatchObject({
      detail: {
        type: "duplicate_alias",
        alias: "Basil",
        attemptedIngredientId: "ingredient-thyme",
        existingIngredientId: "ingredient-basil",
        existingIngredientName: "Basil"
      }
    });

    await expect(
      createAlias(connection.db, {
        id: "alias-invalid-owner",
        alias: "Orphan Alias",
        ingredientId: "missing-ingredient"
      })
    ).rejects.toMatchObject({
      detail: {
        type: "invalid_ingredient_id",
        ingredientId: "missing-ingredient"
      }
    });

    connection.sqlite.close();
  });

  it("throws RepositoryConstraintError for mapped constraint failures", async () => {
    const connection = createMigratedDb();

    await createSection(connection.db, {
      id: "section-produce",
      name: "Produce",
      sortOrder: 1,
      subcategories: []
    });

    await expect(
      createIngredient(connection.db, {
        id: "ingredient-broken",
        name: "Broken",
        sectionId: "missing-section"
      })
    ).rejects.toBeInstanceOf(RepositoryConstraintError);

    await createSection(connection.db, {
      id: "section-referenced",
      name: "Referenced",
      sortOrder: 2,
      subcategories: []
    });
    await createIngredient(connection.db, {
      id: "ingredient-uses-section",
      name: "Uses Section",
      sectionId: "section-referenced"
    });

    await expect(deleteSection(connection.db, "section-referenced")).rejects.toBeInstanceOf(
      RepositoryConstraintError
    );

    connection.sqlite.close();
  });
});
