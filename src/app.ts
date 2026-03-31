import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  type H3Event,
  createApp,
  eventHandler,
  getQuery,
  getRouterParam,
  readBody,
  setResponseStatus
} from "h3";
import { sendApiError } from "./api-error";
import { getDbConnection, type IngredientDb } from "./db/connection";
import { RepositoryConstraintError } from "./db/constraint-errors";
import { processIngredientBatch } from "./ingredient-batch-service";
import {
  formatZodValidationErrors,
  ingredientBatchRequestSchema,
  ingredientBatchResponseSchema
} from "./ingredient-batch-schemas";
import {
  createIngredientWithAliases,
  createSection,
  deleteIngredient,
  deleteSection,
  getIngredientWithAliasesById,
  listIngredientsWithAliases,
  listSections,
  searchIngredientsWithAliases,
  updateIngredientWithAliases,
  updateSection,
  type IngredientWithAliases
} from "./db/repositories";
import { mountStaticFiles } from "./static";

type CreateIngredientAppOptions = {
  getDb?: () => IngredientDb;
};

type SectionRecord = {
  id: string;
  name: string;
  sortOrder: number;
  subcategories: string[];
};

type SectionApiModel = {
  id: string;
  name: string;
  sort_order: number;
  subcategories: string[];
};

type IngredientApiModel = {
  id: string;
  name: string;
  section_id: string;
  section: SectionApiModel;
  aliases: string[];
};

export function createIngredientApp(options: CreateIngredientAppOptions = {}) {
  const app = createApp();
  const getDb = options.getDb ?? (() => getDbConnection().db);

  const publicDir = join(__dirname, "public");
  mountStaticFiles(app, publicDir);

  app.get(
    "/health",
    eventHandler(() => {
      return { status: "ok" };
    })
  );

  app.get(
    "/error-demo",
    eventHandler((event) => {
      return sendApiError(event, 400, "Demo validation error", {
        field: "name"
      });
    })
  );

  app.get(
    "/api/sections",
    eventHandler(async () => {
      const sections = await listSections(getDb());
      return sections.map(toSectionApiModel);
    })
  );

  app.post(
    "/api/sections",
    eventHandler(async (event) => {
      const body = await parseJsonBody(event);
      if (body === undefined) {
        return sendApiError(event, 400, "Validation failed", {
          body: "Expected a JSON object"
        });
      }

      const validation = validateSectionPayload(body, "create");
      if (!validation.valid) {
        return sendApiError(event, 400, "Validation failed", validation.errors);
      }

      const payload = validation.value as {
        name: string;
        sortOrder: number;
        subcategories: string[];
      };

      const created = await createSection(getDb(), {
        id: randomUUID(),
        name: payload.name,
        sortOrder: payload.sortOrder,
        subcategories: payload.subcategories
      });

      if (!created) {
        return sendApiError(event, 500, "Failed to create section");
      }

      setResponseStatus(event, 201);
      return toSectionApiModel(created);
    })
  );

  app.put(
    "/api/sections/:id",
    eventHandler(async (event) => {
      const sectionId = getRouterParam(event, "id");
      if (!sectionId) {
        return sendApiError(event, 400, "Validation failed", {
          id: "Section id is required"
        });
      }

      const body = await parseJsonBody(event);
      if (body === undefined) {
        return sendApiError(event, 400, "Validation failed", {
          body: "Expected a JSON object"
        });
      }

      const validation = validateSectionPayload(body, "update");
      if (!validation.valid) {
        return sendApiError(event, 400, "Validation failed", validation.errors);
      }

      const updated = await updateSection(getDb(), sectionId, validation.value);
      if (!updated) {
        return sendApiError(event, 404, "Section not found", {
          id: sectionId
        });
      }

      return toSectionApiModel(updated);
    })
  );

  app.delete(
    "/api/sections/:id",
    eventHandler(async (event) => {
      const sectionId = getRouterParam(event, "id");
      if (!sectionId) {
        return sendApiError(event, 400, "Validation failed", {
          id: "Section id is required"
        });
      }

      try {
        const deleted = await deleteSection(getDb(), sectionId);
        if (!deleted) {
          return sendApiError(event, 404, "Section not found", {
            id: sectionId
          });
        }
      } catch (error) {
        if (error instanceof RepositoryConstraintError && error.detail.type === "foreign_key_violation") {
          return sendApiError(event, 409, "Section is referenced by existing ingredients", {
            id: sectionId
          });
        }

        throw error;
      }

      setResponseStatus(event, 204);
      return undefined;
    })
  );

  app.get(
    "/api/ingredients",
    eventHandler(async (event) => {
      const query = getQuery(event);
      const sectionId = typeof query.section_id === "string" ? query.section_id : undefined;
      const items = await listIngredientsWithAliases(getDb(), sectionId);
      return items.map(toIngredientApiModel);
    })
  );

  app.get(
    "/api/ingredients/search",
    eventHandler(async (event) => {
      const query = getQuery(event);
      if (typeof query.q !== "string" || query.q.trim().length === 0) {
        return sendApiError(event, 400, "Validation failed", {
          q: "q is required"
        });
      }

      const matches = await searchIngredientsWithAliases(getDb(), query.q);
      return matches.map(toIngredientApiModel);
    })
  );

  app.get(
    "/api/ingredients/:id",
    eventHandler(async (event) => {
      const ingredientId = getRouterParam(event, "id");
      if (!ingredientId) {
        return sendApiError(event, 400, "Validation failed", {
          id: "Ingredient id is required"
        });
      }

      const ingredient = await getIngredientWithAliasesById(getDb(), ingredientId);
      if (!ingredient) {
        return sendApiError(event, 404, "Ingredient not found", {
          id: ingredientId
        });
      }

      return toIngredientApiModel(ingredient);
    })
  );

  app.post(
    "/api/ingredients",
    eventHandler(async (event) => {
      const body = await parseJsonBody(event);
      if (body === undefined) {
        return sendApiError(event, 400, "Validation failed", {
          body: "Expected a JSON object"
        });
      }

      const validation = validateIngredientPayload(body, "create");
      if (!validation.valid) {
        return sendApiError(event, 400, "Validation failed", validation.errors);
      }

      const payload = validation.value as {
        name: string;
        sectionId: string;
        aliases: string[];
      };

      try {
        const created = await createIngredientWithAliases(getDb(), {
          id: randomUUID(),
          name: payload.name,
          sectionId: payload.sectionId,
          aliases: payload.aliases
        });

        if (!created) {
          return sendApiError(event, 500, "Failed to create ingredient");
        }

        setResponseStatus(event, 201);
        return toIngredientApiModel(created);
      } catch (error) {
        const mapped = mapIngredientRepositoryError(event, error);
        if (mapped) {
          return mapped;
        }

        throw error;
      }
    })
  );

  app.post(
    "/api/ingredients/batch",
    eventHandler(async (event) => {
      const body = await parseJsonBody(event);
      if (body === undefined) {
        return sendApiError(event, 400, "Validation failed", {
          body: "Expected a JSON object"
        });
      }

      const validation = ingredientBatchRequestSchema.safeParse(body);
      if (!validation.success) {
        return sendApiError(event, 400, "Validation failed", formatZodValidationErrors(validation.error));
      }

      const result = await processIngredientBatch(getDb(), validation.data.operations);
      const response = {
        summary: result.summary,
        results: result.results.map((item) =>
          item.status === "error"
            ? {
                index: item.index,
                action: item.action,
                status: item.status,
                error: item.error
              }
            : {
                index: item.index,
                action: item.action,
                status: item.status,
                ingredient: toIngredientApiModel(item.ingredient)
              }
        )
      };

      return ingredientBatchResponseSchema.parse(response);
    })
  );

  app.put(
    "/api/ingredients/:id",
    eventHandler(async (event) => {
      const ingredientId = getRouterParam(event, "id");
      if (!ingredientId) {
        return sendApiError(event, 400, "Validation failed", {
          id: "Ingredient id is required"
        });
      }

      const body = await parseJsonBody(event);
      if (body === undefined) {
        return sendApiError(event, 400, "Validation failed", {
          body: "Expected a JSON object"
        });
      }

      const validation = validateIngredientPayload(body, "update");
      if (!validation.valid) {
        return sendApiError(event, 400, "Validation failed", validation.errors);
      }

      try {
        const updated = await updateIngredientWithAliases(getDb(), ingredientId, validation.value);
        if (!updated) {
          return sendApiError(event, 404, "Ingredient not found", {
            id: ingredientId
          });
        }

        return toIngredientApiModel(updated);
      } catch (error) {
        const mapped = mapIngredientRepositoryError(event, error);
        if (mapped) {
          return mapped;
        }

        throw error;
      }
    })
  );

  app.delete(
    "/api/ingredients/:id",
    eventHandler(async (event) => {
      const ingredientId = getRouterParam(event, "id");
      if (!ingredientId) {
        return sendApiError(event, 400, "Validation failed", {
          id: "Ingredient id is required"
        });
      }

      const deleted = await deleteIngredient(getDb(), ingredientId);
      if (!deleted) {
        return sendApiError(event, 404, "Ingredient not found", {
          id: ingredientId
        });
      }

      setResponseStatus(event, 204);
      return undefined;
    })
  );

  return app;
}

function toSectionApiModel(section: SectionRecord): SectionApiModel {
  return {
    id: section.id,
    name: section.name,
    sort_order: section.sortOrder,
    subcategories: section.subcategories
  };
}

function toIngredientApiModel(ingredient: IngredientWithAliases): IngredientApiModel {
  return {
    id: ingredient.id,
    name: ingredient.name,
    section_id: ingredient.sectionId,
    section: toSectionApiModel(ingredient.section),
    aliases: ingredient.aliases
  };
}

async function parseJsonBody(event: H3Event): Promise<Record<string, unknown> | undefined> {
  try {
    const body = await readBody(event);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return undefined;
    }

    return body as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function validateSectionPayload(
  body: Record<string, unknown>,
  mode: "create" | "update"
):
  | {
      valid: true;
      value: {
        name: string;
        sortOrder: number;
        subcategories: string[];
      };
    }
  | {
      valid: true;
      value: {
        name?: string;
        sortOrder?: number;
        subcategories?: string[];
      };
    }
  | {
      valid: false;
      errors: Record<string, string>;
    } {
  const errors: Record<string, string> = {};
  const isCreate = mode === "create";
  const hasName = Object.hasOwn(body, "name");
  const hasSortOrder = Object.hasOwn(body, "sort_order");
  const hasSubcategories = Object.hasOwn(body, "subcategories");

  if (isCreate || hasName) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      errors.name = "Name must be a non-empty string";
    }
  }

  if (isCreate || hasSortOrder) {
    if (typeof body.sort_order !== "number" || !Number.isInteger(body.sort_order)) {
      errors.sort_order = "sort_order must be an integer";
    }
  }

  if (isCreate || hasSubcategories) {
    if (!Array.isArray(body.subcategories) || body.subcategories.some((item) => typeof item !== "string")) {
      errors.subcategories = "subcategories must be an array of strings";
    }
  }

  if (!isCreate && !hasName && !hasSortOrder && !hasSubcategories) {
    errors.body = "Provide at least one of: name, sort_order, subcategories";
  }

  if (Object.keys(errors).length > 0) {
    return {
      valid: false,
      errors
    };
  }

  if (isCreate) {
    return {
      valid: true,
      value: {
        name: body.name as string,
        sortOrder: body.sort_order as number,
        subcategories: body.subcategories as string[]
      }
    };
  }

  return {
    valid: true,
    value: {
      ...(hasName ? { name: body.name as string } : {}),
      ...(hasSortOrder ? { sortOrder: body.sort_order as number } : {}),
      ...(hasSubcategories ? { subcategories: body.subcategories as string[] } : {})
    }
  };
}

function validateIngredientPayload(
  body: Record<string, unknown>,
  mode: "create" | "update"
):
  | {
      valid: true;
      value: {
        name: string;
        sectionId: string;
        aliases: string[];
      };
    }
  | {
      valid: true;
      value: {
        name?: string;
        sectionId?: string;
        aliases?: string[];
      };
    }
  | {
      valid: false;
      errors: Record<string, string>;
    } {
  const errors: Record<string, string> = {};
  const isCreate = mode === "create";
  const hasName = Object.hasOwn(body, "name");
  const hasSectionId = Object.hasOwn(body, "section_id");
  const hasAliases = Object.hasOwn(body, "aliases");

  if (isCreate || hasName) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      errors.name = "Name must be a non-empty string";
    }
  }

  if (isCreate || hasSectionId) {
    if (typeof body.section_id !== "string" || body.section_id.trim().length === 0) {
      errors.section_id = "section_id must be a non-empty string";
    }
  }

  if (isCreate || hasAliases) {
    if (!Array.isArray(body.aliases) || body.aliases.some((item) => typeof item !== "string")) {
      errors.aliases = "aliases must be an array of strings";
    }
  }

  if (!isCreate && !hasName && !hasSectionId && !hasAliases) {
    errors.body = "Provide at least one of: name, section_id, aliases";
  }

  if (Object.keys(errors).length > 0) {
    return {
      valid: false,
      errors
    };
  }

  if (isCreate) {
    return {
      valid: true,
      value: {
        name: (body.name as string).trim(),
        sectionId: (body.section_id as string).trim(),
        aliases: normalizeAliasInput(body.aliases as string[])
      }
    };
  }

  return {
    valid: true,
    value: {
      ...(hasName ? { name: (body.name as string).trim() } : {}),
      ...(hasSectionId ? { sectionId: (body.section_id as string).trim() } : {}),
      ...(hasAliases ? { aliases: normalizeAliasInput(body.aliases as string[]) } : {})
    }
  };
}

function normalizeAliasInput(values: string[]) {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function mapIngredientRepositoryError(event: H3Event, error: unknown) {
  if (!(error instanceof RepositoryConstraintError)) {
    return undefined;
  }

  if (error.detail.type === "invalid_section_id") {
    return sendApiError(event, 400, "Validation failed", {
      section_id: `Section '${error.detail.sectionId}' does not exist`
    });
  }

  if (error.detail.type === "duplicate_alias") {
    const existingOwner = {
      id: error.detail.existingIngredientId,
      name: error.detail.existingIngredientName
    };

    const ownerSuffix = existingOwner.name && existingOwner.id
      ? `${existingOwner.name} (id: ${existingOwner.id})`
      : existingOwner.name
        ? existingOwner.name
        : existingOwner.id
          ? `ingredient id ${existingOwner.id}`
          : "another ingredient";

    return sendApiError(
      event,
      409,
      `Alias '${error.detail.alias}' already belongs to ${ownerSuffix}`,
      {
        alias: error.detail.alias,
        existing_owner: existingOwner,
        attempted_ingredient_id: error.detail.attemptedIngredientId
      }
    );
  }

  return undefined;
}
