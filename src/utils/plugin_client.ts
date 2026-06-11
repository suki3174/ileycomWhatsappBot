import { extractPhoneFromFlowToken } from "@/utils/data_parser";

interface PluginPostOptions {
  timeoutMs?: number;
}

interface PluginRetryOptions extends PluginPostOptions {
  retries?: number;
  retryDelayMs?: number;
}

const PLUGIN_BASE_URL: string =
  process.env.WP_PLUGIN_BASE_URL || "http://localhost/wp-json/whatsapp-bot/v1";
const PLUGIN_API_KEY: string = process.env.WP_PLUGIN_API_KEY || "";

const timeoutFromEnv = Number(process.env.WP_PLUGIN_TIMEOUT_MS || 5000);
export const PLUGIN_TIMEOUT_MS = Number.isFinite(timeoutFromEnv)
  ? Math.max(timeoutFromEnv, 1000)
  : 5000;

/**
 * Extracts a compact token/phone summary for structured logging so plugin calls
 * can be traced without printing full payload contents. This is used only for
 * observability and does not alter request behavior.
 */
function summarizeFlowToken(payload: Record<string, unknown>): { token: string; phone: string } {
  const raw = payload.flow_token;
  const token = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  if (!token) return { token: "", phone: "" };
  return {
    token,
    phone: extractPhoneFromFlowToken(token) ?? "",
  };
}

/**
 * Sends a single POST request to the WordPress plugin API with standardized
 * timeout and authentication headers. The function centralizes transport policy
 * and logging so repository methods stay focused on endpoint-level semantics.
 */
export async function pluginPost(
  path: string,
  payload: Record<string, unknown>,
  options: PluginPostOptions = {},
): Promise<Response> {
  const timeoutMs = Math.max(options.timeoutMs ?? PLUGIN_TIMEOUT_MS, 1000);
 const url = `${PLUGIN_BASE_URL}${path}`;
  const flow = summarizeFlowToken(payload);
  if (
    path === "/seller/product/create/by-flow-token" ||
    path === "/seller/products/by-flow-token"
  ) {
    console.log("pluginPost calling:", url, {
      path,
      flow_token: flow.token || "<missing>",
      flow_phone: flow.phone || "<unparsed>",
    });
  } else {
    console.log("pluginPost calling:", url);
  }
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

/**
 * Wraps pluginPost with timeout-aware retry behavior for transient failures.
 * Only timeout-class errors are retried, which prevents accidental replay on
 * deterministic server-side validation errors.
 */
export async function pluginPostWithRetry(
  path: string,
  payload: Record<string, unknown>,
  options: PluginRetryOptions = {},
): Promise<Response> {
  const retries = Math.max(options.retries ?? 0, 0);
  const retryDelayMs = Math.max(options.retryDelayMs ?? 250, 0);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await pluginPost(path, payload, { timeoutMs: options.timeoutMs });
    } catch (err) {
      const canRetry = isTimeoutError(err) && attempt < retries;
      if (!canRetry) throw err;
      await delay(retryDelayMs);
    }
  }

  throw new Error("pluginPostWithRetry exhausted unexpectedly");
}

/**
 * Identifies timeout-like fetch errors across runtime variants so retry logic
 * can remain implementation-agnostic.
 */
function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { name?: string; code?: number };
  return candidate.name === "TimeoutError" || candidate.code === 23;
}

/**
 * Provides a minimal async backoff primitive for retry spacing.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
