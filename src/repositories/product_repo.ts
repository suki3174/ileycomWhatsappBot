import {
  type Product,
  type ProductVariation,
  ProductType,
} from "@/models/product_model";

const PLUGIN_BASE_URL: string =
  process.env.WP_PLUGIN_BASE_URL || "http://localhost/wp-json/whatsapp-bot/v1";
const PLUGIN_API_KEY: string = process.env.WP_PLUGIN_API_KEY || "";

const timeoutFromEnv = Number(process.env.WP_PLUGIN_TIMEOUT_MS || 5000);
const PLUGIN_TIMEOUT_MS = Number.isFinite(timeoutFromEnv)
  ? Math.max(timeoutFromEnv, 1000)
  : 5000;

function normText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = normText(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

async function pluginPost(
  path: string,
  payload: Record<string, unknown>,
  timeoutMs = PLUGIN_TIMEOUT_MS,
): Promise<Response> {
  return fetch(`${PLUGIN_BASE_URL}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(Math.max(timeoutMs, 1000)),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": PLUGIN_API_KEY,
    },
    body: JSON.stringify(payload),
  });
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { name?: string; code?: number };
  return candidate.name === "TimeoutError" || candidate.code === 23;
}

async function pluginPostWithRetry(
  path: string,
  payload: Record<string, unknown>,
  options: { timeoutMs?: number; retries?: number; retryDelayMs?: number } = {},
): Promise<Response> {
  const timeoutMs = Math.max(options.timeoutMs ?? PLUGIN_TIMEOUT_MS, 1000);
  const retries = Math.max(options.retries ?? 1, 0);
  const retryDelayMs = Math.max(options.retryDelayMs ?? 250, 0);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await pluginPost(path, payload, timeoutMs);
    } catch (err) {
      if (!isTimeoutError(err) || attempt >= retries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error("pluginPostWithRetry exhausted unexpectedly");
}

async function readResponseBodySafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function tryExtractTrailingJsonObject(raw: string): unknown | undefined {
  const text = normText(raw);
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    // Continue to fallback extraction for noisy WP/PHP output.
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

async function parsePluginJsonSafe(
  res: Response,
  context: string,
): Promise<Record<string, unknown> | undefined> {
  const raw = await readResponseBodySafe(res);
  const parsed = tryExtractTrailingJsonObject(raw);

  if (!parsed || typeof parsed !== "object") {
    console.error(`${context} non-json response`, {
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get("content-type") || "",
      bodyPreview: raw.slice(0, 500),
    });
    return undefined;
  }

  return parsed as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normText(item)).filter((item) => item !== "");
}

function mapVariation(rawVariation: unknown): ProductVariation | undefined {
  const row = asRecord(rawVariation);
  if (!row) return undefined;

  const id = normText(row.id);
  if (!id) return undefined;

  const attributes = asRecord(row.attributes) || {};
  const normalizedAttributes: ProductVariation["attributes"] = {};
  for (const [key, value] of Object.entries(attributes)) {
    normalizedAttributes[key] = normText(value);
  }

  return {
    id,
    sku: normText(row.sku),
    title: normText(row.title) || `Variation #${id}`,
    stock: toNum(row.stock, 0),
    attributes: normalizedAttributes,
    price_euro: normText(row.price_euro),
    price_tnd: normText(row.price_tnd),
    image_src: normText(row.image_src),
  };
}

function mapProduct(rawProduct: unknown): Product | undefined {
  const row = asRecord(rawProduct);
  if (!row) return undefined;

  const id = normText(row.id);
  if (!id) return undefined;

  const rawType = normText(row.type).toLowerCase();
  const isVariable = toBool(row.is_variable) || rawType === ProductType.VARIABLE;
  const type = isVariable ? ProductType.VARIABLE : ProductType.SIMPLE;

  const mapped: Product = {
    id,
    name: normText(row.name),
    type,
    sku: normText(row.sku),
    image_src: normText(row.image_src),
    created_at: normText(row.created_at),
    short_description: normText(row.short_description),
    full_description: normText(row.full_description),
    categories: toStringArray(row.categories),
    tags: toStringArray(row.tags),
    general_price_euro: normText(row.general_price_euro),
    general_price_tnd: normText(row.general_price_tnd),
    promo_price_euro: normText(row.promo_price_euro),
    promo_price_tnd: normText(row.promo_price_tnd),
    stock_quantity: toNum(row.stock_quantity, 0),
    manage_stock: toBool(row.manage_stock),
    is_variable: isVariable,
  };

  if (Array.isArray(row.variations)) {
    mapped.variations = row.variations
      .map((variation) => mapVariation(variation))
      .filter((variation): variation is ProductVariation => !!variation);
  }

  return mapped;
}

function extractDataObject(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  return asRecord(payload.data);
}

function extractProductsFromPayload(
  payload: Record<string, unknown> | undefined,
): Product[] {
  const data = extractDataObject(payload);
  if (!data || !Array.isArray(data.products)) return [];

  return data.products
    .map((product) => mapProduct(product))
    .filter((product): product is Product => !!product);
}

function extractProductFromPayload(
  payload: Record<string, unknown> | undefined,
): Product | undefined {
  const data = extractDataObject(payload);
  if (!data) return undefined;
  return mapProduct(data.product);
}

function extractVariationFromPayload(
  payload: Record<string, unknown> | undefined,
): ProductVariation | undefined {
  const data = extractDataObject(payload);
  if (!data) return undefined;
  return mapVariation(data.variation);
}

export async function findProductsBySellerFlowToken(
  flowToken: string,
): Promise<Product[]> {
  const token = normText(flowToken);
  if (!token) return [];

  try {
    const res = await pluginPostWithRetry(
      "/seller/products/by-flow-token",
      { flow_token: token },
      { timeoutMs: PLUGIN_TIMEOUT_MS, retries: 1, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin products/by-flow-token failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return [];
    }

    const payload = await parsePluginJsonSafe(res, "plugin products/by-flow-token");
    return extractProductsFromPayload(payload);
  } catch (err) {
    console.error("plugin products/by-flow-token exception", err);
    return [];
  }
}

export async function findProductById(
  productId: string,
): Promise<Product | undefined> {
  const pid = normText(productId);
  if (!pid) return undefined;

  try {
    const res = await pluginPostWithRetry(
      "/seller/product/by-id",
      { product_id: pid },
      { timeoutMs: PLUGIN_TIMEOUT_MS, retries: 1, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin product/by-id failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return undefined;
    }

    const payload = await parsePluginJsonSafe(res, "plugin product/by-id");
    return extractProductFromPayload(payload);
  } catch (err) {
    console.error("plugin product/by-id exception", err);
    return undefined;
  }
}

export async function findVariationById(
  productId: string,
  variationId: string,
): Promise<ProductVariation | undefined> {
  const pid = normText(productId);
  const vid = normText(variationId);
  if (!pid || !vid) return undefined;

  try {
    const res = await pluginPostWithRetry(
      "/seller/product/variation/by-id",
      { product_id: pid, variation_id: vid },
      { timeoutMs: PLUGIN_TIMEOUT_MS, retries: 1, retryDelayMs: 250 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin product/variation/by-id failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return undefined;
    }

    const payload = await parsePluginJsonSafe(
      res,
      "plugin product/variation/by-id",
    );
    return extractVariationFromPayload(payload);
  } catch (err) {
    console.error("plugin product/variation/by-id exception", err);
    return undefined;
  }
}

