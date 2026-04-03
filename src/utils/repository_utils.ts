// ─── Text Normalisation & Encoding Repair ─────────────────────────────────────

import { normalizeSellerPhone } from "@/utils/seller_auth_helpers";

function looksLikeMojibake(input: string): boolean {
  // Typical sequences from UTF-8 text decoded as latin1/cp1252.
  // Include common Arabic corruption artifacts (e.g. "Ù…Ø¹Ø²").
  return /Ã.|Â.|â[\x80-\xBF]|[ØÙ][^\s]/.test(input) || input.includes("�");
}

function corruptionScore(input: string): number {
  const markerCount = (input.match(/Ã|Â|â|Ø|Ù|�/g) || []).length;
  const controlCount = (input.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g) || []).length;
  return markerCount * 4 + controlCount * 8;
}

function tryRepairMojibake(input: string): string {
  if (!looksLikeMojibake(input)) return input;

  let best = input;
  let bestScore = corruptionScore(input);

  // Apply a couple of latin1->utf8 passes; some strings are double-corrupted.
  for (let i = 0; i < 2; i += 1) {
    try {
      const candidate = Buffer.from(best, "latin1").toString("utf8");
      const score = corruptionScore(candidate);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  // Target common French artifacts that survive generic conversion.
  const patched = best
    .replace(/Ã‰/g, "É")
    .replace(/Ã©/g, "é")
    .replace(/Ã¨/g, "è")
    .replace(/Ãª/g, "ê")
    .replace(/Ã /g, "à")
    .replace(/Ã¢/g, "â")
    .replace(/Ã®/g, "î")
    .replace(/Ã´/g, "ô")
    .replace(/Ã»/g, "û")
    .replace(/Ã§/g, "ç")
    .replace(/�0/g, "É")
    .replace(/â€™/g, "'")
    .replace(/â€“/g, "-")
    .replace(/â€”/g, "-");

  const patchedScore = corruptionScore(patched);
  return patchedScore <= bestScore ? patched : best;
}

export function normText(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return tryRepairMojibake(raw).trim();
}

// ─── Type Coercion ─────────────────────────────────────────────────────────────

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

// ─── Token Parsing ─────────────────────────────────────────────────────────────

export function extractPhoneFromFlowToken(token: string): string | null {
  const tok = normText(token);
  const match = tok.match(/^flowtoken-(.+)-\d+$/);
  if (!match || !match[1]) return null;
  const normalized = normalizeSellerPhone(String(match[1]));
  return normalized || null;
}

// ─── HTTP Response Parsing ───────────────────────────────────────────────────

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
