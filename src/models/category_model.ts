export interface ProductCategory {
  id: string;
  title: string;
}
export interface SubCategory extends ProductCategory {
  parentId: string;
}