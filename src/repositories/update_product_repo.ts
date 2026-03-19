import { fetchAllProductCategories, fetchSubCategoriesByCategory } from "@/repositories/addProduct/product_category_repo";
import type { ProductCategory } from "@/models/category_model";
import { PLUGIN_TIMEOUT_MS, pluginPostWithRetry } from "@/utils/plugin_client";
import {
  asRecord,
  normText,
  parsePluginJsonSafe,
  readResponseBodySafe,
} from "@/utils/repository_utils";

export interface ProductSubcategory {
  id: string;
  title: string;
  description: string;
}

const UPDATE_PRODUCT_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 20_000);

export async function findAllCategories(): Promise<ProductCategory[]> {
  return fetchAllProductCategories();
}

export async function findSubcategoriesByCategory(categoryId: string): Promise<ProductSubcategory[]> {
  const subcategories = await fetchSubCategoriesByCategory(String(categoryId || "").trim());
  return subcategories.map((s) => ({
    id: String(s.id),
    title: String(s.title),
    description: String(s.description || s.title),
  }));
}

export async function persistProductUpdate(
  productId: string,
  flowToken: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const id = String(productId || "").trim();
  const token = normText(flowToken);
  if (!id || !token) return false;

  const res = await pluginPostWithRetry(
    "/seller/product/update/by-flow-token",
    {
      flow_token: token,
      product_id: id,
      product: patch,
    },
    { timeoutMs: UPDATE_PRODUCT_TIMEOUT_MS, retries: 1, retryDelayMs: 300 },
  );

  if (!res.ok) {
    const body = await readResponseBodySafe(res);
    console.error("plugin product/update/by-flow-token failed", {
      status: res.status,
      statusText: res.statusText,
      body,
    });
    return false;
  }

  const payload = await parsePluginJsonSafe(res, "plugin product/update/by-flow-token");
  if (!payload) {
    return false;
  }

  const success = payload?.success;
  if (success === false) {
    const err = asRecord(payload?.error);
    console.error("plugin product/update/by-flow-token error payload", {
      code: normText(err?.code),
      message: normText(err?.message),
      details: asRecord(err?.details),
    });
    return false;
  }

  const data = asRecord(payload?.data);
  if (!data) {
    return false;
  }
  const updated = normText(data?.updated);
  if (typeof data.updated === "boolean") {
    return data.updated;
  }
  return updated !== "" && updated !== "false";
}

