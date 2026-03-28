import { z } from "zod";

const nonEmptyString = z
  .string({ message: "Expected a string" })
  .trim()
  .min(1, "Must be a non-empty string");

const createOperationSchema = z
  .object({
    action: z.literal("create"),
    name: nonEmptyString,
    section_id: nonEmptyString,
    aliases: z.array(z.string({ message: "Expected a string" })).optional()
  })
  .transform((value) => ({
    action: "create" as const,
    name: value.name,
    sectionId: value.section_id,
    aliases: normalizeAliasValues(value.aliases ?? [])
  }));

const updateOperationSchema = z
  .object({
    action: z.literal("update"),
    id: nonEmptyString,
    name: nonEmptyString.optional(),
    section_id: nonEmptyString.optional(),
    aliases: z.array(z.string({ message: "Expected a string" })).optional()
  })
  .superRefine((value, context) => {
    if (value.name === undefined && value.section_id === undefined && value.aliases === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one of: name, section_id, aliases",
        path: []
      });
    }
  })
  .transform((value) => ({
    action: "update" as const,
    id: value.id,
    ...(value.name === undefined ? {} : { name: value.name }),
    ...(value.section_id === undefined ? {} : { sectionId: value.section_id }),
    ...(value.aliases === undefined ? {} : { aliases: normalizeAliasValues(value.aliases) })
  }));

const batchOperationSchema = z.discriminatedUnion("action", [
  createOperationSchema,
  updateOperationSchema
]);

export const ingredientBatchRequestSchema = z.object({
  operations: z.array(batchOperationSchema).min(1, "operations must include at least one operation")
});

const apiErrorSchema = z.object({
  status: z.number().int(),
  message: z.string(),
  details: z.unknown().optional()
});

const sectionApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  sort_order: z.number().int(),
  subcategories: z.array(z.string())
});

const ingredientApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  section_id: z.string(),
  section: sectionApiSchema,
  aliases: z.array(z.string())
});

const successResultSchema = z.object({
  index: z.number().int().nonnegative(),
  action: z.enum(["create", "update"]),
  status: z.enum(["created", "updated"]),
  ingredient: ingredientApiSchema
});

const errorResultSchema = z.object({
  index: z.number().int().nonnegative(),
  action: z.enum(["create", "update"]),
  status: z.literal("error"),
  error: apiErrorSchema
});

export const ingredientBatchResponseSchema = z.object({
  summary: z.object({
    total: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative()
  }),
  results: z.array(z.union([successResultSchema, errorResultSchema]))
});

export type IngredientBatchRequest = z.infer<typeof ingredientBatchRequestSchema>;
export type IngredientBatchOperationInput = IngredientBatchRequest["operations"][number];
export type IngredientBatchResponse = z.infer<typeof ingredientBatchResponseSchema>;

export function formatZodValidationErrors(error: z.ZodError): Record<string, string> {
  const details: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0
      ? issue.path
        .map((segment) => (typeof segment === "number" ? String(segment) : segment))
        .join(".")
      : "body";

    if (!Object.hasOwn(details, path)) {
      details[path] = issue.message;
    }
  }

  return details;
}

function normalizeAliasValues(values: string[]) {
  const deduped = new Set<string>();

  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0) {
      continue;
    }

    deduped.add(normalized);
  }

  return [...deduped];
}
