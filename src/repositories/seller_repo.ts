import type { Seller } from "@/models/seller.model";

// Base URL for WordPress plugin REST endpoints.
const PLUGIN_BASE_URL: string = process.env.WP_PLUGIN_BASE_URL || "http://localhost/wp-json/whatsapp-bot/v1";
// Shared API key expected by plugin middleware.
const PLUGIN_API_KEY: string = process.env.WP_PLUGIN_API_KEY || "";
// Global plugin timeout, clamped to a minimum safety floor.
const timeoutFromEnv = Number(process.env.WP_PLUGIN_TIMEOUT_MS || 5000);
const PLUGIN_TIMEOUT_MS = Number.isFinite(timeoutFromEnv)
  ? Math.max(timeoutFromEnv, 1000)
  : 5000;
// Use a higher timeout for state insert because WordPress can be slower on first writes.
const STATE_INSERT_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 15000);

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

// Reads raw response body safely for diagnostics on non-JSON or aborted responses.
async function readResponseBodySafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
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
globalThis.sellers = globalThis.sellers || [ {
    name: "Taher",
    email: "gamingafroskull@gmail.com",
    code: "1234",
    phone: "21650354773",
    flow_token: null,
  },];

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

    const data = await res.json();
    if (!data || !data.data || !data.data.seller) return undefined;

    return data.data.seller as Seller;
  } catch {
    return undefined;
  }
}

// Fetches seller by flow token from plugin endpoint.
export async function findSellerByFlowToken(token: string): Promise<Seller | undefined> {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return undefined;

  try {
    const res = await pluginPost("/seller/by-flow-token", { flow_token: normalizedToken });

    if (!res.ok) return undefined;

    const data = await res.json();
    if (!data || !data.data || !data.data.seller) return undefined;

    return data.data.seller as Seller;
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
    const res = await pluginPost("/seller/update-code", { flow_token: token, code });

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

    const data = await res.json();

    if (!data || !data.data || !data.data.seller) {
      console.error("plugin update-code invalid response shape", { data });
      return undefined;
    }

    return data.data.seller as Seller;
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

  // Activates seller session and sets expiration to now + 24h.
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
    const res = await pluginPost("/seller/state/insert", payload, { timeoutMs: STATE_INSERT_TIMEOUT_MS });

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

    const data = await res.json();
    if (!data || !data.data || !data.data.seller) {
      console.error("plugin state-insert invalid response shape", { data });
      return undefined;
    }

    return data.data.seller as Seller;
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

    const data = await res.json();
    return !!(data && data.data && data.data.seller);
  } catch {
    return false;
  }
}

// Deactivates seller session for given flow token.
export async function desactivateSellerSession(token : string): Promise<Seller | undefined> {
  try {
    const res = await pluginPost("/seller/session/deactivate", { flow_token: token });

    if (!res.ok) return undefined;
// Stores password reset token payload for seller identified by email.

    const data = await res.json();
    if (!data || !data.data || !data.data.seller) return undefined;

    return data.data.seller as Seller;
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

    const data = await res.json();
    if (!data || !data.data || !data.data.seller) return undefined;

    return data.data.seller as Seller;
  } catch {
    return undefined;
  }
}