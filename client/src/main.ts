import "./style.css";

type Section = {
  id: string;
  name: string;
  sort_order: number;
  subcategories: string[];
};

type Ingredient = {
  id: string;
  name: string;
  section_id: string;
  section: Section;
  aliases: string[];
};

const searchInput = document.getElementById("search") as HTMLInputElement;
const resultsEl = document.getElementById("results")!;

let debounceTimer: ReturnType<typeof setTimeout>;

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const query = searchInput.value.trim();
    if (query.length === 0) {
      loadAll();
    } else {
      search(query);
    }
  }, 250);
});

async function loadAll() {
  try {
    const res = await fetch("/api/ingredients");
    const ingredients: Ingredient[] = await res.json();
    render(ingredients);
  } catch {
    resultsEl.innerHTML = `<p class="error">Failed to load ingredients.</p>`;
  }
}

async function search(query: string) {
  try {
    const res = await fetch(`/api/ingredients/search?q=${encodeURIComponent(query)}`);
    const ingredients: Ingredient[] = await res.json();
    render(ingredients);
  } catch {
    resultsEl.innerHTML = `<p class="error">Search failed.</p>`;
  }
}

function render(ingredients: Ingredient[]) {
  if (ingredients.length === 0) {
    resultsEl.innerHTML = `<p class="empty">No ingredients found.</p>`;
    return;
  }

  const grouped = new Map<string, { section: Section; items: Ingredient[] }>();
  for (const ing of ingredients) {
    const key = ing.section_id;
    if (!grouped.has(key)) {
      grouped.set(key, { section: ing.section, items: [] });
    }
    grouped.get(key)!.items.push(ing);
  }

  const sorted = [...grouped.values()].sort(
    (a, b) => a.section.sort_order - b.section.sort_order
  );

  resultsEl.innerHTML = sorted
    .map(
      ({ section, items }) => `
    <section>
      <h2>${esc(section.name)}</h2>
      <ul>
        ${items
          .map(
            (ing) => `
          <li>
            <span class="name">${esc(ing.name)}</span>
            ${ing.aliases.length ? `<span class="aliases">${ing.aliases.map(esc).join(", ")}</span>` : ""}
          </li>`
          )
          .join("")}
      </ul>
    </section>`
    )
    .join("");
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

loadAll();
