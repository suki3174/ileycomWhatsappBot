export function normText(value: unknown): string {
  return String(value ?? "").trim();
}

export function toNum(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = normText(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normText(item)).filter((item) => item !== "");
}

export function extractPhoneFromFlowToken(token: string): string | null {
  const tok = normText(token);
  const match = tok.match(/^flowtoken-(.+)-\d+$/);
  if (!match || !match[1]) return null;
  const normalized = String(match[1]).replace(/\D+/g, "");
  return normalized || null;
}

export async function readResponseBodySafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export function tryExtractTrailingJsonObject(raw: string): unknown | undefined {
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

export async function parsePluginJsonSafe(
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
