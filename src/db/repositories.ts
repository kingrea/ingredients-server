import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { IngredientDb } from "./connection";
import {
  mapDbConstraintError,
  RepositoryConstraintError
} from "./constraint-errors";
import { aliases, ingredients, sections, type NewAlias, type NewIngredient, type NewSection } from "./schema";

type SectionLookup = {
  id: string;
  name: string;
  sortOrder: number;
  subcategories: string[];
};

export type IngredientWithAliases = {
  id: string;
  name: string;
  sectionId: string;
  section: SectionLookup;
  aliases: string[];
};

type CreateIngredientWithAliasesInput = {
  id: string;
  name: string;
  sectionId: string;
  aliases?: string[];
};

type UpdateIngredientWithAliasesInput = {
  name?: string;
  sectionId?: string;
  aliases?: string[];
};

export async function createSection(db: IngredientDb, input: NewSection) {
  db.insert(sections).values(input).run();
  return getSectionById(db, input.id);
}

export async function listSections(db: IngredientDb) {
  return db.select().from(sections).orderBy(sections.sortOrder, sections.name).all();
}

export async function getSectionById(db: IngredientDb, id: string) {
  return db.select().from(sections).where(eq(sections.id, id)).get();
}

export async function updateSection(
  db: IngredientDb,
  id: string,
  input: Partial<Pick<NewSection, "name" | "sortOrder" | "subcategories">>
) {
  if (Object.keys(input).length === 0) {
    return getSectionById(db, id);
  }

  db.update(sections).set(input).where(eq(sections.id, id)).run();
  return getSectionById(db, id);
}

export async function deleteSection(db: IngredientDb, id: string) {
  try {
    const result = db.delete(sections).where(eq(sections.id, id)).run();
    return result.changes > 0;
  } catch (error) {
    const mapped = mapDbConstraintError(error);
    if (mapped) {
      throw new RepositoryConstraintError(mapped, error);
    }

    throw error;
  }
}

export async function createIngredient(db: IngredientDb, input: NewIngredient) {
  try {
    db.insert(ingredients).values(input).run();
  } catch (error) {
    const mapped = mapDbConstraintError(error, { sectionId: input.sectionId });
    if (mapped) {
      throw new RepositoryConstraintError(mapped, error);
    }
    throw error;
  }

  return getIngredientById(db, input.id);
}

export async function listIngredients(db: IngredientDb, sectionId?: string) {
  const query = db.select().from(ingredients);
  if (!sectionId) {
    return query.orderBy(ingredients.name).all();
  }

  return query
    .where(eq(ingredients.sectionId, sectionId))
    .orderBy(ingredients.name)
    .all();
}

export async function getIngredientById(db: IngredientDb, id: string) {
  return db.select().from(ingredients).where(eq(ingredients.id, id)).get();
}

export async function updateIngredient(
  db: IngredientDb,
  id: string,
  input: Partial<Pick<NewIngredient, "name" | "sectionId">>
) {
  if (Object.keys(input).length === 0) {
    return getIngredientById(db, id);
  }

  try {
    db.update(ingredients).set(input).where(eq(ingredients.id, id)).run();
  } catch (error) {
    const mapped = mapDbConstraintError(error, { sectionId: input.sectionId });
    if (mapped) {
      throw new RepositoryConstraintError(mapped, error);
    }
    throw error;
  }

  return getIngredientById(db, id);
}

export async function deleteIngredient(db: IngredientDb, id: string) {
  const didDelete = db.transaction((tx) => {
    tx.delete(aliases).where(eq(aliases.ingredientId, id)).run();
    const result = tx.delete(ingredients).where(eq(ingredients.id, id)).run();
    return result.changes > 0;
  });

  return didDelete;
}

export async function createIngredientWithAliases(
  db: IngredientDb,
  input: CreateIngredientWithAliasesInput
) {
  const aliasValues = normalizeAliases(input.name, input.aliases);

  db.transaction((tx) => {
    try {
      tx.insert(ingredients)
        .values({
          id: input.id,
          name: input.name,
          sectionId: input.sectionId
        })
        .run();
    } catch (error) {
      const mapped = mapDbConstraintError(error, { sectionId: input.sectionId });
      if (mapped) {
        throw new RepositoryConstraintError(mapped, error);
      }

      throw error;
    }

    for (const aliasValue of aliasValues) {
      try {
        tx.insert(aliases)
            .values({
            id: randomUUID(),
            alias: aliasValue,
            ingredientId: input.id
          })
          .run();
      } catch (error) {
        throw mapAliasError(db, error, aliasValue, input.id);
      }
    }
  });

  return getIngredientWithAliasesById(db, input.id);
}

export async function updateIngredientWithAliases(
  db: IngredientDb,
  id: string,
  input: UpdateIngredientWithAliasesInput
) {
  const updated = db.transaction((tx) => {
    const existing = tx.select().from(ingredients).where(eq(ingredients.id, id)).get();
    if (!existing) {
      return false;
    }

    const ingredientUpdates: Partial<Pick<NewIngredient, "name" | "sectionId">> = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.sectionId === undefined ? {} : { sectionId: input.sectionId })
    };

    if (Object.keys(ingredientUpdates).length > 0) {
      try {
        tx.update(ingredients).set(ingredientUpdates).where(eq(ingredients.id, id)).run();
      } catch (error) {
        const mapped = mapDbConstraintError(error, {
          sectionId: ingredientUpdates.sectionId
        });
        if (mapped) {
          throw new RepositoryConstraintError(mapped, error);
        }

        throw error;
      }
    }

    if (input.aliases !== undefined) {
      const aliasValues = normalizeAliases(undefined, input.aliases);
      tx.delete(aliases).where(eq(aliases.ingredientId, id)).run();

      for (const aliasValue of aliasValues) {
        try {
          tx.insert(aliases)
            .values({
              id: randomUUID(),
              alias: aliasValue,
              ingredientId: id
            })
            .run();
        } catch (error) {
          throw mapAliasError(db, error, aliasValue, id);
        }
      }
    }

    return true;
  });

  if (!updated) {
    return undefined;
  }

  return getIngredientWithAliasesById(db, id);
}

export async function listIngredientsWithAliases(db: IngredientDb, sectionId?: string) {
  const [ingredientRows, sectionRows, aliasRows] = await Promise.all([
    listIngredients(db, sectionId),
    listSections(db),
    listAliases(db)
  ]);

  return hydrateIngredients(ingredientRows, sectionRows, aliasRows);
}

export async function getIngredientWithAliasesById(db: IngredientDb, id: string) {
  const [ingredient, sectionRows, aliasRows] = await Promise.all([
    getIngredientById(db, id),
    listSections(db),
    listAliases(db)
  ]);

  if (!ingredient) {
    return undefined;
  }

  const hydrated = hydrateIngredients([ingredient], sectionRows, aliasRows);
  return hydrated[0];
}

export async function searchIngredientsWithAliases(db: IngredientDb, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) {
    return [];
  }

  const hydrated = await listIngredientsWithAliases(db);
  return hydrated
    .filter((item) => {
      const nameMatch = item.name.toLocaleLowerCase().includes(normalizedQuery);
      const aliasMatch = item.aliases.some((aliasValue) =>
        aliasValue.toLocaleLowerCase().includes(normalizedQuery)
      );
      return nameMatch || aliasMatch;
    })
    .sort((left, right) => {
      const leftRank = ingredientSearchRank(left, normalizedQuery);
      const rightRank = ingredientSearchRank(right, normalizedQuery);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const nameCompare = left.name.localeCompare(right.name);
      if (nameCompare !== 0) {
        return nameCompare;
      }

      return left.id.localeCompare(right.id);
    });
}

export async function createAlias(db: IngredientDb, input: NewAlias) {
  try {
    db.insert(aliases).values(input).run();
  } catch (error) {
    throw mapAliasError(db, error, input.alias, input.ingredientId);
  }

  return getAliasById(db, input.id);
}

export async function listAliases(db: IngredientDb, ingredientId?: string) {
  const query = db.select().from(aliases);
  if (!ingredientId) {
    return query.orderBy(aliases.alias).all();
  }

  return query
    .where(eq(aliases.ingredientId, ingredientId))
    .orderBy(aliases.alias)
    .all();
}

export async function getAliasById(db: IngredientDb, id: string) {
  return db.select().from(aliases).where(eq(aliases.id, id)).get();
}

export async function getAliasByValue(db: IngredientDb, alias: string) {
  return db.select().from(aliases).where(eq(aliases.alias, alias)).get();
}

export async function updateAlias(
  db: IngredientDb,
  id: string,
  input: Partial<Pick<NewAlias, "alias" | "ingredientId">>
) {
  if (Object.keys(input).length === 0) {
    return getAliasById(db, id);
  }

  const existing = await getAliasById(db, id);
  if (!existing) {
    return undefined;
  }

  const nextAlias = input.alias ?? existing.alias;
  const nextIngredientId = input.ingredientId ?? existing.ingredientId;

  try {
    db.update(aliases).set(input).where(eq(aliases.id, id)).run();
  } catch (error) {
    throw mapAliasError(db, error, nextAlias, nextIngredientId, id);
  }

  return getAliasById(db, id);
}

export async function deleteAlias(db: IngredientDb, id: string) {
  const result = db.delete(aliases).where(eq(aliases.id, id)).run();
  return result.changes > 0;
}

function mapAliasError(
  db: IngredientDb,
  error: unknown,
  alias: string,
  ingredientId: string,
  ignoreAliasId?: string
): Error {
  const whereClause = ignoreAliasId
    ? and(eq(aliases.alias, alias), ne(aliases.id, ignoreAliasId))
    : eq(aliases.alias, alias);

  const existingOwner = db
    .select({
      ingredientId: aliases.ingredientId,
      ingredientName: ingredients.name
    })
    .from(aliases)
    .innerJoin(ingredients, eq(aliases.ingredientId, ingredients.id))
    .where(whereClause)
    .get();

  const mapped = mapDbConstraintError(error, {
    alias,
    ingredientId,
    existingIngredientId: existingOwner?.ingredientId,
    existingIngredientName: existingOwner?.ingredientName
  });

  if (mapped) {
    return new RepositoryConstraintError(mapped, error);
  }

  return error instanceof Error ? error : new Error("Unknown repository error", { cause: error });
}

function normalizeAliases(canonicalAlias?: string, aliasValues: string[] = []) {
  const values = [
    ...(canonicalAlias === undefined ? [] : [canonicalAlias]),
    ...aliasValues
  ];

  const deduped = new Set<string>();
  for (const value of values) {
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      continue;
    }

    deduped.add(trimmedValue);
  }

  return [...deduped];
}

function hydrateIngredients(
  ingredientRows: Array<{ id: string; name: string; sectionId: string }>,
  sectionRows: SectionLookup[],
  aliasRows: Array<{ alias: string; ingredientId: string }>
) {
  const sectionById = new Map(sectionRows.map((section) => [section.id, section]));
  const aliasesByIngredientId = new Map<string, string[]>();

  for (const alias of aliasRows) {
    const existing = aliasesByIngredientId.get(alias.ingredientId) ?? [];
    existing.push(alias.alias);
    aliasesByIngredientId.set(alias.ingredientId, existing);
  }

  return ingredientRows
    .map((ingredient) => {
      const section = sectionById.get(ingredient.sectionId);
      if (!section) {
        return undefined;
      }

      return {
        id: ingredient.id,
        name: ingredient.name,
        sectionId: ingredient.sectionId,
        section,
        aliases: [...(aliasesByIngredientId.get(ingredient.id) ?? [])].sort((left, right) =>
          left.localeCompare(right)
        )
      };
    })
    .filter((item): item is IngredientWithAliases => item !== undefined);
}

function ingredientSearchRank(item: IngredientWithAliases, normalizedQuery: string) {
  if (item.name.toLocaleLowerCase() === normalizedQuery) {
    return 0;
  }

  if (item.aliases.some((aliasValue) => aliasValue.toLocaleLowerCase() === normalizedQuery)) {
    return 1;
  }

  return 2;
}
