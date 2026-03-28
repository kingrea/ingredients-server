import { randomUUID } from "node:crypto";
import { createApiError, type ApiErrorEnvelope } from "./api-error";
import { RepositoryConstraintError } from "./db/constraint-errors";
import {
  createIngredientWithAliases,
  updateIngredientWithAliases,
  type IngredientWithAliases
} from "./db/repositories";
import type { IngredientDb } from "./db/connection";
import type { IngredientBatchOperationInput } from "./ingredient-batch-schemas";

type IngredientBatchSuccessResult = {
  index: number;
  action: "create" | "update";
  status: "created" | "updated";
  ingredient: IngredientWithAliases;
};

type IngredientBatchErrorResult = {
  index: number;
  action: "create" | "update";
  status: "error";
  error: ApiErrorEnvelope["error"];
};

export type ProcessIngredientBatchResult = {
  summary: {
    total: number;
    created: number;
    updated: number;
    failed: number;
  };
  results: Array<IngredientBatchSuccessResult | IngredientBatchErrorResult>;
};

export async function processIngredientBatch(
  db: IngredientDb,
  operations: IngredientBatchOperationInput[]
): Promise<ProcessIngredientBatchResult> {
  const results: Array<IngredientBatchSuccessResult | IngredientBatchErrorResult> = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const [index, operation] of operations.entries()) {
    if (operation.action === "create") {
      try {
        const ingredient = await createIngredientWithAliases(db, {
          id: randomUUID(),
          name: operation.name,
          sectionId: operation.sectionId,
          aliases: operation.aliases
        });

        if (!ingredient) {
          throw new Error("Failed to create ingredient");
        }

        results.push({
          index,
          action: operation.action,
          status: "created",
          ingredient
        });
        created += 1;
      } catch (error) {
        failed += 1;
        results.push({
          index,
          action: operation.action,
          status: "error",
          error: mapBatchOperationError(error)
        });
      }

      continue;
    }

    try {
      const ingredient = await updateIngredientWithAliases(db, operation.id, {
        ...(operation.name === undefined ? {} : { name: operation.name }),
        ...(operation.sectionId === undefined ? {} : { sectionId: operation.sectionId }),
        ...(operation.aliases === undefined ? {} : { aliases: operation.aliases })
      });

      if (!ingredient) {
        failed += 1;
        results.push({
          index,
          action: operation.action,
          status: "error",
          error: createApiError(404, "Ingredient not found", {
            id: operation.id
          }).error
        });
        continue;
      }

      results.push({
        index,
        action: operation.action,
        status: "updated",
        ingredient
      });
      updated += 1;
    } catch (error) {
      failed += 1;
      results.push({
        index,
        action: operation.action,
        status: "error",
        error: mapBatchOperationError(error)
      });
    }
  }

  return {
    summary: {
      total: operations.length,
      created,
      updated,
      failed
    },
    results
  };
}

function mapBatchOperationError(error: unknown): ApiErrorEnvelope["error"] {
  if (!(error instanceof RepositoryConstraintError)) {
    return createApiError(500, "Unexpected batch operation failure").error;
  }

  if (error.detail.type === "invalid_section_id") {
    return createApiError(400, "Validation failed", {
      section_id: `Section '${error.detail.sectionId}' does not exist`
    }).error;
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

    return createApiError(
      409,
      `Alias '${error.detail.alias}' already belongs to ${ownerSuffix}`,
      {
        alias: error.detail.alias,
        existing_owner: existingOwner,
        attempted_ingredient_id: error.detail.attemptedIngredientId
      }
    ).error;
  }

  return createApiError(500, "Unexpected batch operation failure").error;
}
