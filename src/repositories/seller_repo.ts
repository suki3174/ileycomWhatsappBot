import type { Seller } from "@/models/seller_model";

// Base URL for WordPress plugin REST endpoints.
const PLUGIN_BASE_URL: string = process.env.WP_PLUGIN_BASE_URL || "http://localhost/wp-json/whatsapp-bot/v1";
// Shared API key expected by plugin middleware.
const PLUGIN_API_KEY: string = process.env.WP_PLUGIN_API_KEY || "";
// Global plugin timeout, clamped to a minimum safety floor.
const timeoutFromEnv = Number(process.env.WP_PLUGIN_TIMEOUT_MS || 5000);
const PLUGIN_TIMEOUT_MS = Number.isFinite(timeoutFromEnv)
  ? Math.max(timeoutFromEnv, 1000)
  : 5000;
const FLOW_LOOKUP_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 10000);
const UPDATE_CODE_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 12000);
// Use a higher timeout for state insert because WordPress can be slower on first writes.
const STATE_INSERT_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 20000);

// Generic POST helper for plugin routes with per-call timeout override.
async function pluginPost(
  path: string,
  payload: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
) {
  // Resolve per-call timeout (fallback to global timeout if none provided).
  const timeoutMs = Math.max(options.timeoutMs ?? PLUGIN_TIMEOUT_MS, 1000);
  return fetch(`${PLUGIN_BASE_URL}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
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
  // AbortSignal.timeout in Node fetch may surface as TimeoutError or DOMException code 23.
  return candidate.name === "TimeoutError" || candidate.code === 23;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pluginPostWithRetry(
  path: string,
  payload: Record<string, unknown>,
  options: { timeoutMs?: number; retries?: number; retryDelayMs?: number } = {},
): Promise<Response> {
  const retries = Math.max(options.retries ?? 0, 0);
  const retryDelayMs = Math.max(options.retryDelayMs ?? 250, 0);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await pluginPost(path, payload, { timeoutMs: options.timeoutMs });
    } catch (err) {
      // Retry only transient timeout failures; preserve non-timeout errors immediately.
      const canRetry = isTimeoutError(err) && attempt < retries;
      if (!canRetry) throw err;
      await delay(retryDelayMs);
    }
  }

  throw new Error("pluginPostWithRetry exhausted unexpectedly");
}

// Reads raw response body safely for diagnostics on non-JSON or aborted responses.
async function readResponseBodySafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function tryExtractTrailingJsonObject(raw: string): unknown | undefined {
  const text = String(raw || "").trim();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    // Continue to extraction fallback.
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;

  // Handles cases where PHP warnings/HTML are prepended before the JSON payload.
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
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
    // Log a short body preview to identify noisy WP/PHP output without flooding logs.
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

function extractSellerFromPluginPayload(payload: Record<string, unknown> | undefined): Seller | undefined {
  if (!payload) return undefined;
  // Expected plugin shape: { success: true, data: { seller: {...} } }
  const data = payload.data;
  if (!data || typeof data !== "object") return undefined;
  const seller = (data as { seller?: unknown }).seller;
  if (!seller || typeof seller !== "object") return undefined;
  return seller as Seller;
}

// const sellers: Seller[] = [
  // {
  //   name: "Sara",
  //   email: "sara.kal2004@gmail.com",
  //   code: "1234",
  //   phone: "21628997072",
  //   session_active: false,
  //   flow_token: null,
  // },
// ];
declare global {
  var sellers: Seller[] | undefined;
}

// In-memory fallback seed seller used outside plugin-backed flows.
globalThis.sellers = globalThis.sellers || [ 
  {
    name: "sara",
    email: "sara.kal2004@gmail.com",
    code: "1234",
    phone: "21628997072",
    flow_token: null,
  }
  ];

export const sellers: Seller[] = globalThis.sellers;

// Extracts normalized phone from token format: flowtoken-<phone>-<timestamp>.
function extractPhoneFromFlowToken(token: string): string | null {
  const tok = String(token || "").trim();
  const match = tok.match(/^flowtoken-(.+)-\d+$/);
  if (!match || !match[1]) return null;
  const normalized = String(match[1]).replace(/\D+/g, "");
  return normalized || null;
}

// Returns local in-memory sellers.
export function findAllSellers(): Seller[] {
  return sellers;
}

// Fetches seller by phone from plugin endpoint.
export async function findSellerByPhone(phone: string): Promise<Seller | undefined> {
  try {
    const res = await pluginPost("/seller/by-phone", { phone });

    if (!res.ok) return undefined;

    const data = await parsePluginJsonSafe(res, "plugin by-phone");
    return extractSellerFromPluginPayload(data);
  } catch {
    return undefined;
  }
}

// Fetches seller by flow token from plugin endpoint.
export async function findSellerByFlowToken(token: string): Promise<Seller | undefined> {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return undefined;

  try {
    const res = await pluginPostWithRetry(
      "/seller/by-flow-token",
      { flow_token: normalizedToken },
      { timeoutMs: FLOW_LOOKUP_TIMEOUT_MS, retries: 1, retryDelayMs: 250 },
    );

    if (!res.ok) return undefined;

    const data = await parsePluginJsonSafe(res, "plugin by-flow-token");
    return extractSellerFromPluginPayload(data);
  } catch {
    return undefined;
  }
}

// Updates seller code in plugin state by flow token.
export async function updateSellerCode(
  token: string,
  code: string,
): Promise<Seller | undefined> {
  try {
    const res = await pluginPostWithRetry(
      "/seller/update-code",
      { flow_token: token, code },
      { timeoutMs: UPDATE_CODE_TIMEOUT_MS, retries: 1, retryDelayMs: 300 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin update-code failed", {
        status: res.status,
        statusText: res.statusText,
        body,
        tokenPresent: !!String(token || "").trim(),
      });
      return undefined;
    }

    const data = await parsePluginJsonSafe(res, "plugin update-code");

    const seller = extractSellerFromPluginPayload(data);
    if (!seller) {
      console.error("plugin update-code invalid response shape", { data });
      return undefined;
    }

    return seller;
  } catch (err) {
    console.error("plugin update-code exception", err);
    return undefined;
  }
}

// Inserts or refreshes seller state row using token-derived phone.
export async function insertSellerState(
  token: string,
  code: string | null = null,
): Promise<Seller | undefined> {
  // Derive phone from flow token because plugin state/insert expects phone.
  const phone = extractPhoneFromFlowToken(token);
  if (!phone) {
    console.error("plugin state-insert skipped: could not extract phone from flow token", {
      token,
    });
    return undefined;
  }

  try {

    // Build request payload with required fields only.
    const payload: Record<string, unknown> = {
      phone,
      flow_token: token,
    };

    // Include code only when explicitly provided to avoid overwriting existing code with null/empty.
    if (code !== null) {
      payload.code = code;
    }

    // Call state/insert with extended timeout for slow WordPress writes.
    const res = await pluginPostWithRetry(
      "/seller/state/insert",
      payload,
      { timeoutMs: STATE_INSERT_TIMEOUT_MS, retries: 1, retryDelayMs: 400 },
    );

    if (!res.ok) {
      const body = await readResponseBodySafe(res);
      console.error("plugin state-insert failed", {
        status: res.status,
        statusText: res.statusText,
        body,
        phone,
      });
      return undefined;
    }

    const data = await parsePluginJsonSafe(res, "plugin state-insert");
    const seller = extractSellerFromPluginPayload(data);
    if (!seller) {
      console.error("plugin state-insert invalid response shape", { data });
      return undefined;
    }

    return seller;
  } catch (err) {
    console.error("plugin state-insert exception", err);
    return undefined;
  }
}




export async function activateSellerSession(token:string): Promise<boolean> {
  try {
    const sessionActiveUntil = Date.now() + 24 * 60 * 60 * 1000;
    const res = await pluginPost("/seller/session/activate", {
      flow_token: token,
      session_active_until: sessionActiveUntil,
    });

    if (!res.ok) return false;

    const data = await parsePluginJsonSafe(res, "plugin session-activate");
    return !!extractSellerFromPluginPayload(data);
  } catch {
    return false;
  }
}

// Deactivates seller session for given flow token.
export async function desactivateSellerSession(token : string): Promise<Seller | undefined> {
  try {
    const res = await pluginPost("/seller/session/deactivate", { flow_token: token });

    if (!res.ok) return undefined;

    const data = await parsePluginJsonSafe(res, "plugin session-deactivate");
    return extractSellerFromPluginPayload(data);
  } catch {
    return undefined;
  }
}


export async function setResetToken(
  email: string,
  token: string,
  expiry: number
): Promise<Seller | undefined> {
  try {
    const res = await pluginPost("/seller/reset-token/set", {
      email,
      reset_token: token,
      reset_token_expiry: expiry,
    });

    if (!res.ok) return undefined;

    const data = await parsePluginJsonSafe(res, "plugin reset-token-set");
    return extractSellerFromPluginPayload(data);
  } catch {
    return undefined;
  }
}