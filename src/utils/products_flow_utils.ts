export function normalizeFlowLabel(value: string): string {
  // Replace typographic apostrophes/quotes with plain ASCII equivalents to
  // avoid rendering artifacts in some WhatsApp clients.
  return String(value || "")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2039\u203A\u276C\u276D]/g, "'")
    .replace(/[\uFFFD]/g, "'")
    .replace(/\u00A0/g, " ")
    .trim();
}

export function sanitizeRichText(value: string): string {
  const raw = String(value || "");
  if (!raw) return "";

  const noTags = raw.replace(/<[^>]*>/g, " ");
  const decoded = noTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  // Remove control characters and collapse whitespace for compact flow text.
  return normalizeFlowLabel(decoded)
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toPositivePage(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (n <= 0) return undefined;
  return Math.floor(n);
}

export function resolvePageValue(
  value: unknown,
  currentPage: number,
  nextPage?: number,
  prevPage?: number,
): number | undefined {
  const direct = toPositivePage(value);
  if (direct) return direct;

  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  // Handle literal flow-template style payloads such as:
  // "${data.current_page} + 1", "${data.current_page}-1", "${data.next_page}"
  if (raw.includes("next_page")) {
    return nextPage ?? currentPage + 1;
  }
  if (raw.includes("prev_page")) {
    return prevPage ?? Math.max(1, currentPage - 1);
  }

  const expr = raw.match(/current_page\}\s*([+-])\s*(\d+)/i);
  if (expr) {
    const op = expr[1];
    const delta = Number(expr[2]);
    if (Number.isFinite(delta) && delta > 0) {
      return op === "+" ? currentPage + delta : Math.max(1, currentPage - delta);
    }
  }

  return undefined;
}

export function resolveFlowImageUrl(
  rawUrl: string,
  options: { requestHost?: string; requestProto?: string },
): string {
  void rawUrl;
  void options;

  // Temporary mode: force a simple public placeholder image URL.
  return "https://placehold.co/640x400/png?text=No+Image";
}
