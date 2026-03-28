import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createIngredientApp } from "../src/app";
import { createDbConnection, type DbConnection } from "../src/db/connection";
import { createAlias, createIngredient, createSection, listAliases } from "../src/db/repositories";

const tempDirs: string[] = [];

function createMigratedDb(): DbConnection {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ingredient-db-app-"));
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

describe("ingredient app", () => {
  it("returns health status", async () => {
    const app = createIngredientApp();
    const response = await app.fetch(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("uses the shared api error envelope", async () => {
    const app = createIngredientApp();
    const response = await app.fetch(new Request("http://localhost/error-demo"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        status: 400,
        message: "Demo validation error",
        details: {
          field: "name"
        }
      }
    });
  });

  it("returns sections ordered by sort_order", async () => {
    const connection = createMigratedDb();
    await createSection(connection.db, {
      id: "section-pantry",
      name: "Pantry",
      sortOrder: 2,
      subcategories: []
    });
    await createSection(connection.db, {
      id: "section-produce",
      name: "Produce",
      sortOrder: 1,
      subcategories: ["Leafy Greens"]
    });

    const app = createIngredientApp({ getDb: () => connection.db });
    const response = await app.fetch(new Request("http://localhost/api/sections"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: "section-produce",
        name: "Produce",
        sort_order: 1,
        subcategories: ["Leafy Greens"]
      },
      {
        id: "section-pantry",
        name: "Pantry",
        sort_order: 2,
        subcategories: []
      }
    ]);

    connection.sqlite.close();
  });

  it("creates sections with payload validation", async () => {
    const connection = createMigratedDb();
    const app = createIngredientApp({ getDb: () => connection.db });

    const badResponse = await app.fetch(
      new Request("http://localhost/api/sections", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "",
          sort_order: "first"
        })
      })
    );

    expect(badResponse.status).toBe(400);
    await expect(badResponse.json()).resolves.toEqual({
      error: {
        status: 400,
        message: "Validation failed",
        details: {
          name: "Name must be a non-empty string",
          sort_order: "sort_order must be an integer",
          subcategories: "subcategories must be an array of strings"
        }
      }
    });

    const createResponse = await app.fetch(
      new Request("http://localhost/api/sections", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Frozen",
          sort_order: 3,
          subcategories: ["Vegetables"]
        })
      })
    );

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      id: string;
      name: string;
      sort_order: number;
      subcategories: string[];
    };
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Frozen");
    expect(created.sort_order).toBe(3);
    expect(created.subcategories).toEqual(["Vegetables"]);

    const listResponse = await app.fetch(new Request("http://localhost/api/sections"));
    await expect(listResponse.json()).resolves.toHaveLength(1);

    connection.sqlite.close();
  });

  it("updates existing sections and returns 404 for unknown id", async () => {
    const connection = createMigratedDb();
    await createSection(connection.db, {
      id: "section-dairy",
      name: "Dairy",
      sortOrder: 2,
      subcategories: ["Cheese"]
    });

    const app = createIngredientApp({ getDb: () => connection.db });

    const updateResponse = await app.fetch(
      new Request("http://localhost/api/sections/section-dairy", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Cultured Dairy",
          sort_order: 4,
          subcategories: ["Cheese", "Yogurt"]
        })
      })
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual({
      id: "section-dairy",
      name: "Cultured Dairy",
      sort_order: 4,
      subcategories: ["Cheese", "Yogurt"]
    });

    const notFoundResponse = await app.fetch(
      new Request("http://localhost/api/sections/missing", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Missing"
        })
      })
    );

    expect(notFoundResponse.status).toBe(404);
    await expect(notFoundResponse.json()).resolves.toEqual({
      error: {
        status: 404,
        message: "Section not found",
        details: {
          id: "missing"
        }
      }
    });

    connection.sqlite.close();
  });

  it("deletes unreferenced sections and rejects FK conflicts", async () => {
    const connection = createMigratedDb();
    await createSection(connection.db, {
      id: "section-delete-me",
      name: "Delete Me",
      sortOrder: 1,
      subcategories: []
    });
    await createSection(connection.db, {
      id: "section-referenced",
      name: "Referenced",
      sortOrder: 2,
      subcategories: []
    });
    await createIngredient(connection.db, {
      id: "ingredient-onion",
      name: "Onion",
      sectionId: "section-referenced"
    });

    const app = createIngredientApp({ getDb: () => connection.db });

    const deleteResponse = await app.fetch(
      new Request("http://localhost/api/sections/section-delete-me", {
        method: "DELETE"
      })
    );
    expect(deleteResponse.status).toBe(204);

    const conflictResponse = await app.fetch(
      new Request("http://localhost/api/sections/section-referenced", {
        method: "DELETE"
      })
    );
    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toEqual({
      error: {
        status: 409,
        message: "Section is referenced by existing ingredients",
        details: {
          id: "section-referenced"
        }
      }
    });

    const notFoundResponse = await app.fetch(
      new Request("http://localhost/api/sections/missing", {
        method: "DELETE"
      })
    );
    expect(notFoundResponse.status).toBe(404);

    connection.sqlite.close();
  });

  it("lists ingredients with section metadata and aliases", async () => {
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
    await createIngredient(connection.db, {
      id: "ingredient-basil",
      name: "Basil",
      sectionId: "section-produce"
    });
    await createIngredient(connection.db, {
      id: "ingredient-salt",
      name: "Salt",
      sectionId: "section-pantry"
    });
    await createAlias(connection.db, {
      id: "alias-basil",
      alias: "Basil",
      ingredientId: "ingredient-basil"
    });
    await createAlias(connection.db, {
      id: "alias-sweet-basil",
      alias: "Sweet Basil",
      ingredientId: "ingredient-basil"
    });
    await createAlias(connection.db, {
      id: "alias-kosher-salt",
      alias: "Kosher Salt",
      ingredientId: "ingredient-salt"
    });

    const app = createIngredientApp({ getDb: () => connection.db });
    const response = await app.fetch(new Request("http://localhost/api/ingredients"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: "ingredient-basil",
        name: "Basil",
        section_id: "section-produce",
        section: {
          id: "section-produce",
          name: "Produce",
          sort_order: 1,
          subcategories: ["Herbs"]
        },
        aliases: ["Basil", "Sweet Basil"]
      },
      {
        id: "ingredient-salt",
        name: "Salt",
        section_id: "section-pantry",
        section: {
          id: "section-pantry",
          name: "Pantry",
          sort_order: 2,
          subcategories: []
        },
        aliases: ["Kosher Salt"]
      }
    ]);

    const filteredResponse = await app.fetch(
      new Request("http://localhost/api/ingredients?section_id=section-produce")
    );
    expect(filteredResponse.status).toBe(200);
    await expect(filteredResponse.json()).resolves.toEqual([
      {
        id: "ingredient-basil",
        name: "Basil",
        section_id: "section-produce",
        section: {
          id: "section-produce",
          name: "Produce",
          sort_order: 1,
          subcategories: ["Herbs"]
        },
        aliases: ["Basil", "Sweet Basil"]
      }
    ]);

    connection.sqlite.close();
  });

  it("returns ingredient details by id", async () => {
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
    await createAlias(connection.db, {
      id: "alias-basil",
      alias: "Basil",
      ingredientId: "ingredient-basil"
    });

    const app = createIngredientApp({ getDb: () => connection.db });

    const foundResponse = await app.fetch(
      new Request("http://localhost/api/ingredients/ingredient-basil")
    );
    expect(foundResponse.status).toBe(200);
    await expect(foundResponse.json()).resolves.toEqual({
      id: "ingredient-basil",
      name: "Basil",
      section_id: "section-produce",
      section: {
        id: "section-produce",
        name: "Produce",
        sort_order: 1,
        subcategories: []
      },
      aliases: ["Basil"]
    });

    const notFoundResponse = await app.fetch(new Request("http://localhost/api/ingredients/missing"));
    expect(notFoundResponse.status).toBe(404);
    await expect(notFoundResponse.json()).resolves.toEqual({
      error: {
        status: 404,
        message: "Ingredient not found",
        details: {
          id: "missing"
        }
      }
    });

    connection.sqlite.close();
  });

  it("creates ingredients and adds canonical alias once", async () => {
    const connection = createMigratedDb();
    await createSection(connection.db, {
      id: "section-produce",
      name: "Produce",
      sortOrder: 1,
      subcategories: []
    });

    const app = createIngredientApp({ getDb: () => connection.db });

    const badSectionResponse = await app.fetch(
      new Request("http://localhost/api/ingredients", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Basil",
          section_id: "missing-section"
        })
      })
    );
    expect(badSectionResponse.status).toBe(400);

    const createResponse = await app.fetch(
      new Request("http://localhost/api/ingredients", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Basil",
          section_id: "section-produce",
          aliases: ["Sweet Basil", "Basil", "  Basil  "]
        })
      })
    );

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      id: string;
      aliases: string[];
      section_id: string;
    };
    expect(created.id).toBeTruthy();
    expect(created.section_id).toBe("section-produce");
    expect(created.aliases).toEqual(["Basil", "Sweet Basil"]);

    connection.sqlite.close();
  });

  it("updates ingredients and keeps alias replacement atomic on conflicts", async () => {
    const connection = createMigratedDb();
    await createSection(connection.db, {
      id: "section-produce",
      name: "Produce",
      sortOrder: 1,
      subcategories: []
    });
    await createIngredient(connection.db, {
      id: "ingredient-onion",
      name: "Onion",
      sectionId: "section-produce"
    });
    await createIngredient(connection.db, {
      id: "ingredient-garlic",
      name: "Garlic",
      sectionId: "section-produce"
    });
    await createAlias(connection.db, {
      id: "alias-onion",
      alias: "Onion",
      ingredientId: "ingredient-onion"
    });
    await createAlias(connection.db, {
      id: "alias-garlic",
      alias: "Garlic",
      ingredientId: "ingredient-garlic"
    });

    const app = createIngredientApp({ getDb: () => connection.db });

    const updateResponse = await app.fetch(
      new Request("http://localhost/api/ingredients/ingredient-onion", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Red Onion",
          aliases: ["Red Onion", "Shallot"]
        })
      })
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: "ingredient-onion",
      name: "Red Onion",
      aliases: ["Red Onion", "Shallot"]
    });

    const conflictResponse = await app.fetch(
      new Request("http://localhost/api/ingredients/ingredient-onion", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Broken Onion",
          aliases: ["Garlic"]
        })
      })
    );

    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toEqual({
      error: {
        status: 409,
        message: "Alias 'Garlic' already belongs to Garlic (id: ingredient-garlic)",
        details: {
          alias: "Garlic",
          existing_owner: {
            id: "ingredient-garlic",
            name: "Garlic"
          },
          attempted_ingredient_id: "ingredient-onion"
        }
      }
    });

    const checkResponse = await app.fetch(
      new Request("http://localhost/api/ingredients/ingredient-onion")
    );
    await expect(checkResponse.json()).resolves.toMatchObject({
      id: "ingredient-onion",
      name: "Red Onion",
      aliases: ["Red Onion", "Shallot"]
    });

    connection.sqlite.close();
  });

  it("processes ingredient batches with per-item success and failure results", async () => {
    const connection = createMigratedDb();
    await createSection(connection.db, {
      id: "section-produce",
      name: "Produce",
      sortOrder: 1,
      subcategories: []
    });
    await createIngredient(connection.db, {
      id: "ingredient-garlic",
      name: "Garlic",
      sectionId: "section-produce"
    });
    await createAlias(connection.db, {
      id: "alias-garlic",
      alias: "Garlic",
      ingredientId: "ingredient-garlic"
    });

    const app = createIngredientApp({ getDb: () => connection.db });

    const response = await app.fetch(
      new Request("http://localhost/api/ingredients/batch", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          operations: [
            {
              action: "create",
              name: "Basil",
              section_id: "section-produce",
              aliases: ["  Basil  ", "Sweet Basil", "Sweet Basil"]
            },
            {
              action: "update",
              id: "ingredient-garlic",
              aliases: ["Garlic", "Roasted Garlic", " Garlic "]
            },
            {
              action: "update",
              id: "ingredient-missing",
              aliases: ["Ghost"]
            }
          ]
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      summary: { total: number; created: number; updated: number; failed: number };
      results: Array<Record<string, unknown>>;
    };

    expect(payload.summary).toEqual({
      total: 3,
      created: 1,
      updated: 1,
      failed: 1
    });

    expect(payload.results[0]).toMatchObject({
      index: 0,
      action: "create",
      status: "created",
      ingredient: {
        name: "Basil",
        section_id: "section-produce",
        aliases: ["Basil", "Sweet Basil"]
      }
    });
    expect(payload.results[1]).toMatchObject({
      index: 1,
      action: "update",
      status: "updated",
      ingredient: {
        id: "ingredient-garlic",
        aliases: ["Garlic", "Roasted Garlic"]
      }
    });
    expect(payload.results[2]).toEqual({
      index: 2,
      action: "update",
      status: "error",
      error: {
        status: 404,
        message: "Ingredient not found",
        details: {
          id: "ingredient-missing"
        }
      }
    });

    connection.sqlite.close();
  });

  it("rejects invalid batch payloads with precise operation paths", async () => {
    const connection = createMigratedDb();
    const app = createIngredientApp({ getDb: () => connection.db });

    const response = await app.fetch(
      new Request("http://localhost/api/ingredients/batch", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          operations: [
            {
              action: "create",
              name: "Basil",
              aliases: ["Basil"]
            },
            {
              action: "update",
              id: "ingredient-basil"
            }
          ]
        })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        status: 400,
        message: "Validation failed",
        details: {
          "operations.0.section_id": "Expected a string",
          "operations.1": "Provide at least one of: name, section_id, aliases"
        }
      }
    });

    connection.sqlite.close();
  });

  it("keeps sibling operations committed when a batch item conflicts", async () => {
    const connection = createMigratedDb();
    await createSection(connection.db, {
      id: "section-produce",
      name: "Produce",
      sortOrder: 1,
      subcategories: []
    });
    await createIngredient(connection.db, {
      id: "ingredient-onion",
      name: "Onion",
      sectionId: "section-produce"
    });
    await createIngredient(connection.db, {
      id: "ingredient-garlic",
      name: "Garlic",
      sectionId: "section-produce"
    });
    await createAlias(connection.db, {
      id: "alias-onion",
      alias: "Onion",
      ingredientId: "ingredient-onion"
    });
    await createAlias(connection.db, {
      id: "alias-garlic",
      alias: "Garlic",
      ingredientId: "ingredient-garlic"
    });

    const app = createIngredientApp({ getDb: () => connection.db });
    const response = await app.fetch(
      new Request("http://localhost/api/ingredients/batch", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          operations: [
            {
              action: "update",
              id: "ingredient-onion",
              aliases: ["Onion", "Shallot"]
            },
            {
              action: "update",
              id: "ingredient-garlic",
              aliases: ["Shallot"]
            }
          ]
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      summary: {
        total: 2,
        created: 0,
        updated: 1,
        failed: 1
      },
      results: [
        {
          index: 0,
          action: "update",
          status: "updated",
          ingredient: {
            id: "ingredient-onion",
            aliases: ["Onion", "Shallot"]
          }
        },
        {
          index: 1,
          action: "update",
          status: "error",
          error: {
            status: 409,
            message: "Alias 'Shallot' already belongs to Onion (id: ingredient-onion)"
          }
        }
      ]
    });

    const onionResponse = await app.fetch(new Request("http://localhost/api/ingredients/ingredient-onion"));
    await expect(onionResponse.json()).resolves.toMatchObject({
      aliases: ["Onion", "Shallot"]
    });

    const garlicResponse = await app.fetch(new Request("http://localhost/api/ingredients/ingredient-garlic"));
    await expect(garlicResponse.json()).resolves.toMatchObject({
      aliases: ["Garlic"]
    });

    connection.sqlite.close();
  });

  it("deduplicates aliases so replaying batch updates stays idempotent", async () => {
    const connection = createMigratedDb();
    await createSection(connection.db, {
      id: "section-produce",
      name: "Produce",
      sortOrder: 1,
      subcategories: []
    });
    await createIngredient(connection.db, {
      id: "ingredient-onion",
      name: "Onion",
      sectionId: "section-produce"
    });
    await createAlias(connection.db, {
      id: "alias-onion",
      alias: "Onion",
      ingredientId: "ingredient-onion"
    });

    const app = createIngredientApp({ getDb: () => connection.db });
    const request = new Request("http://localhost/api/ingredients/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operations: [
          {
            action: "update",
            id: "ingredient-onion",
            aliases: [" Onion ", "Onion", "Red Onion", "Red Onion", ""]
          }
        ]
      })
    });

    const firstResponse = await app.fetch(request.clone());
    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toMatchObject({
      summary: {
        total: 1,
        created: 0,
        updated: 1,
        failed: 0
      }
    });

    const secondResponse = await app.fetch(request.clone());
    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toMatchObject({
      summary: {
        total: 1,
        created: 0,
        updated: 1,
        failed: 0
      }
    });

    const aliasRows = await listAliases(connection.db, "ingredient-onion");
    expect(aliasRows.map((item) => item.alias)).toEqual(["Onion", "Red Onion"]);

    connection.sqlite.close();
  });

  it("deletes ingredients and linked aliases", async () => {
    const connection = createMigratedDb();
    await createSection(connection.db, {
      id: "section-pantry",
      name: "Pantry",
      sortOrder: 1,
      subcategories: []
    });
    await createIngredient(connection.db, {
      id: "ingredient-salt",
      name: "Salt",
      sectionId: "section-pantry"
    });
    await createAlias(connection.db, {
      id: "alias-salt",
      alias: "Salt",
      ingredientId: "ingredient-salt"
    });

    const app = createIngredientApp({ getDb: () => connection.db });

    const deleteResponse = await app.fetch(
      new Request("http://localhost/api/ingredients/ingredient-salt", {
        method: "DELETE"
      })
    );
    expect(deleteResponse.status).toBe(204);

    await expect(listAliases(connection.db, "ingredient-salt")).resolves.toEqual([]);

    const notFoundResponse = await app.fetch(
      new Request("http://localhost/api/ingredients/ingredient-salt")
    );
    expect(notFoundResponse.status).toBe(404);

    connection.sqlite.close();
  });

  it("searches ingredients by name and alias with exact-match boost", async () => {
    const connection = createMigratedDb();
    await createSection(connection.db, {
      id: "section-produce",
      name: "Produce",
      sortOrder: 1,
      subcategories: []
    });
    await createIngredient(connection.db, {
      id: "ingredient-fresh-sage",
      name: "Fresh Sage",
      sectionId: "section-produce"
    });
    await createIngredient(connection.db, {
      id: "ingredient-herb-mix",
      name: "Herb Mix",
      sectionId: "section-produce"
    });
    await createIngredient(connection.db, {
      id: "ingredient-sage-leaf",
      name: "Sage Leaf",
      sectionId: "section-produce"
    });
    await createAlias(connection.db, {
      id: "alias-fresh-sage",
      alias: "Fresh Sage",
      ingredientId: "ingredient-fresh-sage"
    });
    await createAlias(connection.db, {
      id: "alias-sage",
      alias: "Sage",
      ingredientId: "ingredient-herb-mix"
    });
    await createAlias(connection.db, {
      id: "alias-sage-leaf",
      alias: "Sage Leaf",
      ingredientId: "ingredient-sage-leaf"
    });

    const app = createIngredientApp({ getDb: () => connection.db });

    const response = await app.fetch(new Request("http://localhost/api/ingredients/search?q=SaGe"));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Array<{ id: string }>;
    expect(payload.map((item) => item.id)).toEqual([
      "ingredient-herb-mix",
      "ingredient-fresh-sage",
      "ingredient-sage-leaf"
    ]);

    const badResponse = await app.fetch(new Request("http://localhost/api/ingredients/search"));
    expect(badResponse.status).toBe(400);

    connection.sqlite.close();
  });
});
