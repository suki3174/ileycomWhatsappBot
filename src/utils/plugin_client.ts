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

export async function pluginPost(
  path: string,
  payload: Record<string, unknown>,
  options: PluginPostOptions = {},
): Promise<Response> {
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

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { name?: string; code?: number };
  return candidate.name === "TimeoutError" || candidate.code === 23;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
