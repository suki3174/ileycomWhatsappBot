function looksLikeMojibake(input: string): boolean {
  // Typical sequences from UTF-8 text decoded as latin1/cp1252.
  return /Ã.|Â.|â[\x80-\xBF]/.test(input) || input.includes("�");
}

function tryRepairMojibake(input: string): string {
  if (!looksLikeMojibake(input)) return input;

  try {
    const repaired = Buffer.from(input, "latin1").toString("utf8");
    // Keep repair only when it clearly reduces mojibake markers.
    const beforeScore = (input.match(/Ã|Â|â|�/g) || []).length;
    const afterScore = (repaired.match(/Ã|Â|â|�/g) || []).length;
    return afterScore < beforeScore ? repaired : input;
  } catch {
    return input;
  }
}

export function normText(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return tryRepairMojibake(raw).trim();
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
  const text = String(raw ?? "").trim();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    // Continue to fallback extraction for noisy WP/PHP output.
  }

  const firstObj = extractFirstCompleteJsonObject(text);
  if (!firstObj) return undefined;

  try {
    return JSON.parse(firstObj);
  } catch {
    return undefined;
  }
}

function extractFirstCompleteJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return undefined;
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
