type ConstraintContext = {
  alias?: string;
  sectionId?: string;
  ingredientId?: string;
  existingIngredientId?: string;
  existingIngredientName?: string;
};

type SqliteError = {
  code?: string;
  message?: string;
};

export type DbConstraintError =
  | {
      type: "duplicate_alias";
      alias: string;
      attemptedIngredientId?: string;
      existingIngredientId?: string;
      existingIngredientName?: string;
    }
  | {
      type: "invalid_section_id";
      sectionId: string;
    }
  | {
      type: "invalid_ingredient_id";
      ingredientId: string;
    }
  | {
      type: "foreign_key_violation";
    };

function asSqliteError(error: unknown): SqliteError | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  return error as SqliteError;
}

export function mapDbConstraintError(
  error: unknown,
  context: ConstraintContext = {}
): DbConstraintError | null {
  const sqliteError = asSqliteError(error);

  if (!sqliteError) {
    return null;
  }

  const message = sqliteError.message ?? "";
  const code = sqliteError.code ?? "";
  const isAliasUniqueViolation =
    message.includes("UNIQUE constraint failed: aliases.alias") ||
    (message.includes("aliases.alias") && code.includes("UNIQUE"));
  const isForeignKeyViolation =
    message.includes("FOREIGN KEY constraint failed") || code.includes("FOREIGNKEY");

  if (isAliasUniqueViolation) {
    return {
      type: "duplicate_alias",
      alias: context.alias ?? "",
      attemptedIngredientId: context.ingredientId,
      existingIngredientId: context.existingIngredientId,
      existingIngredientName: context.existingIngredientName
    };
  }

  if (isForeignKeyViolation) {
    if (context.sectionId) {
      return {
        type: "invalid_section_id",
        sectionId: context.sectionId
      };
    }

    if (context.ingredientId) {
      return {
        type: "invalid_ingredient_id",
        ingredientId: context.ingredientId
      };
    }

    return {
      type: "foreign_key_violation"
    };
  }

  return null;
}

export class RepositoryConstraintError extends Error {
  readonly detail: DbConstraintError;

  constructor(detail: DbConstraintError, cause?: unknown) {
    super(`Database constraint violated: ${detail.type}`, { cause });
    this.name = "RepositoryConstraintError";
    this.detail = detail;
  }
}
