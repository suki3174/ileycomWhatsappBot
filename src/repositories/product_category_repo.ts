export interface ProductCategory {
  id: string;
  title: string;
}

const MOCK_CATEGORIES: ProductCategory[] = [
  { id: "mode", title: "Mode & Vetements" },
  { id: "electronique", title: "Electronique" },
  { id: "maison", title: "Maison & Decoration" },
  { id: "beaute", title: "Beaute & Sante" },
  { id: "sport", title: "Sport & Loisirs" },
  { id: "alimentaire", title: "Alimentaire" },
  { id: "jouets", title: "Jouets & Enfants" },
  { id: "auto", title: "Auto & Moto" },
  { id: "livres", title: "Livres & Papeterie" },
  { id: "autre", title: "Autre" },
];

let cachedCategories: ProductCategory[] | null = null;
let lastFetchAt = 0;
const CATEGORIES_TTL_MS = 60 * 60 * 1000;

export async function fetchAllProductCategories(): Promise<ProductCategory[]> {
  const now = Date.now();
  if (cachedCategories && now - lastFetchAt <= CATEGORIES_TTL_MS) {
    return cachedCategories;
  }

  // Placeholder: in production, replace with plugin/DB call
  cachedCategories = MOCK_CATEGORIES;
  lastFetchAt = now;
  return cachedCategories;
}

