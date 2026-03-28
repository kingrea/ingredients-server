import type { NewSection } from "./schema";

export const DEFAULT_SECTIONS: NewSection[] = [
  {
    id: "section-produce",
    name: "Produce",
    sortOrder: 1,
    subcategories: ["Fruits", "Vegetables", "Herbs"]
  },
  {
    id: "section-meat",
    name: "Meat",
    sortOrder: 2,
    subcategories: ["Beef", "Poultry", "Pork", "Seafood"]
  },
  {
    id: "section-deli",
    name: "Deli",
    sortOrder: 3,
    subcategories: ["Prepared Foods", "Cold Cuts", "Cheese"]
  },
  {
    id: "section-bakery",
    name: "Bakery",
    sortOrder: 4,
    subcategories: ["Bread", "Pastries", "Tortillas"]
  },
  {
    id: "section-a1",
    name: "A1",
    sortOrder: 5,
    subcategories: []
  },
  {
    id: "section-a2",
    name: "A2",
    sortOrder: 6,
    subcategories: []
  },
  {
    id: "section-a3",
    name: "A3",
    sortOrder: 7,
    subcategories: []
  },
  {
    id: "section-a4",
    name: "A4",
    sortOrder: 8,
    subcategories: []
  },
  {
    id: "section-a5",
    name: "A5",
    sortOrder: 9,
    subcategories: []
  },
  {
    id: "section-a6",
    name: "A6",
    sortOrder: 10,
    subcategories: []
  },
  {
    id: "section-a7",
    name: "A7",
    sortOrder: 11,
    subcategories: []
  },
  {
    id: "section-a8",
    name: "A8",
    sortOrder: 12,
    subcategories: []
  },
  {
    id: "section-a9",
    name: "A9",
    sortOrder: 13,
    subcategories: []
  },
  {
    id: "section-a10",
    name: "A10",
    sortOrder: 14,
    subcategories: []
  },
  {
    id: "section-a11",
    name: "A11",
    sortOrder: 15,
    subcategories: []
  },
  {
    id: "section-dairy",
    name: "Dairy",
    sortOrder: 16,
    subcategories: ["Milk", "Yogurt", "Cheese", "Eggs"]
  },
  {
    id: "section-frozen",
    name: "Frozen",
    sortOrder: 17,
    subcategories: ["Vegetables", "Meals", "Desserts"]
  },
  {
    id: "section-unknown",
    name: "Unknown",
    sortOrder: 18,
    subcategories: []
  }
];
