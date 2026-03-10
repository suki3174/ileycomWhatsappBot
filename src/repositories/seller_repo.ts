import type { Seller } from "@/models/seller_model";
import { PLUGIN_TIMEOUT_MS, pluginPost, pluginPostWithRetry } from "@/utils/plugin_client";
import {
  extractPhoneFromFlowToken,
  normText,
  parsePluginJsonSafe,
  readResponseBodySafe,
} from "@/utils/repository_utils";

const FLOW_LOOKUP_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 10000);
const UPDATE_CODE_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 12000);
// Keep signup responsive: state insert must fail fast instead of blocking ~40s.
const STATE_INSERT_TIMEOUT_MS = Math.max(PLUGIN_TIMEOUT_MS, 8000);

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
    email: "gamingafroskull@gmail.com",
    code: "1234",
    phone: "21628997072",
    flow_token: null,
  },
  
  ];

export const sellers: Seller[] = globalThis.sellers;

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
  const normalizedToken = normText(token);
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
        tokenPresent: !!normText(token),
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

    // Call state/insert with bounded timeout and no retry to avoid long signup hangs.
    const res = await pluginPostWithRetry(
      "/seller/state/insert",
      payload,
      { timeoutMs: STATE_INSERT_TIMEOUT_MS, retries: 0, retryDelayMs: 250 },
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