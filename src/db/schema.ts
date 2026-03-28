import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sections = sqliteTable("sections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  subcategories: text("subcategories", { mode: "json" })
    .$type<string[]>()
    .notNull()
});

export const ingredients = sqliteTable("ingredients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sectionId: text("section_id")
    .notNull()
    .references(() => sections.id)
});

export const aliases = sqliteTable(
  "aliases",
  {
    id: text("id").primaryKey(),
    alias: text("alias").notNull(),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredients.id)
  },
  (table) => [uniqueIndex("aliases_alias_unique").on(table.alias)]
);

export type Section = typeof sections.$inferSelect;
export type NewSection = typeof sections.$inferInsert;

export type Ingredient = typeof ingredients.$inferSelect;
export type NewIngredient = typeof ingredients.$inferInsert;

export type Alias = typeof aliases.$inferSelect;
export type NewAlias = typeof aliases.$inferInsert;
