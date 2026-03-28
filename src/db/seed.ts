import { DEFAULT_SECTIONS } from "./default-sections";
import { createDbConnection, type IngredientDb } from "./connection";
import { sections } from "./schema";

export async function seedDefaultSections(db: IngredientDb) {
  db.transaction((tx) => {
    for (const section of DEFAULT_SECTIONS) {
      tx.insert(sections)
        .values(section)
        .onConflictDoUpdate({
          target: sections.id,
          set: {
            name: section.name,
            sortOrder: section.sortOrder,
            subcategories: section.subcategories
          }
        })
        .run();
    }
  });

  return DEFAULT_SECTIONS.length;
}

export async function runSeed() {
  const connection = createDbConnection();

  try {
    const seededCount = await seedDefaultSections(connection.db);
    return seededCount;
  } finally {
    connection.sqlite.close();
  }
}

if (require.main === module) {
  runSeed().then((seededCount) => {
    process.stdout.write(`Seeded ${seededCount} default sections.\n`);
  });
}
