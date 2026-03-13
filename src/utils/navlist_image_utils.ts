/**
 * Utilities for converting product image URLs to base64 for WhatsApp NavigationList.
 *
 * WhatsApp NavigationList start.image constraints:
 * - Must be base64 encoded JPEG or PNG (data URI not needed, raw base64 only)
 * - Max 100KB per image (102,400 bytes)
 * - Recommended dimensions: square, 72×72 to 300×300px
 * - WEBP not supported on iOS < 14 — always output JPEG
 */

import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

const MAX_BYTES = 90_000; // 90KB — leave headroom under 100KB limit
// 1x1 transparent PNG fallback to avoid empty image fields on transient failures.
const FALLBACK_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z2ioAAAAASUVORK5CYII=";
const PLACEHOLDER_PATH = path.resolve(process.cwd(), "public", "placeholder.png");

// In-memory cache: image URL → base64 string
// Keyed by URL, value is the processed base64 or empty string on failure
const imageCache = new Map<string, string>();

let placeholderBufferPromise: Promise<Buffer | null> | null = null;

function getCandidateDocRoots(): string[] {
  const roots = [
    process.env.WP_LOCAL_DOC_ROOT,
    "C:\\xampp\\htdocs",
    "C:\\xampp\\htdocs\\ILEYCOM",
    "C:\\xampp\\htdocs\\ILEYCOM\\wordpress",
  ].filter((value): value is string => !!String(value || "").trim());

  return Array.from(new Set(roots.map((value) => path.normalize(value))));
}

function normalizeTargetSize(size?: number): number {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return 200;
  return Math.max(72, Math.min(300, Math.floor(n)));
}

/**
 * For localhost image URLs, try to read the file directly from disk.
 * Returns the file buffer, or null if unavailable.
 */
async function readLocalImage(imageUrl: string): Promise<Buffer | null> {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return null;
  }

  if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    return null;
  }

  const relativePath = parsed.pathname.replace(/^\/+/, "").replace(/\//g, path.sep);

  for (const docRoot of getCandidateDocRoots()) {
    const localPath = path.join(docRoot, relativePath);
    try {
      return await fs.readFile(localPath);
    } catch {
      // Try the next candidate root.
    }
  }

  return null;
}

async function readPlaceholderImage(): Promise<Buffer | null> {
  if (!placeholderBufferPromise) {
    placeholderBufferPromise = fs.readFile(PLACEHOLDER_PATH).catch(() => null);
  }

  return placeholderBufferPromise;
}

async function buildImageBase64(imageUrl: string, targetSize: number): Promise<string> {
  const cacheKey = `${imageUrl || "__placeholder__"}::${targetSize}`;

  const cached = imageCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    let inputBuffer = imageUrl ? await readLocalImage(imageUrl) : null;

    if (!inputBuffer && imageUrl) {
      const response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.warn("navlist image fetch failed:", imageUrl, response.status);
      } else {
        const arrayBuffer = await response.arrayBuffer();
        inputBuffer = Buffer.from(arrayBuffer);
      }
    }

    if (!inputBuffer) {
      inputBuffer = await readPlaceholderImage();
    }

    if (!inputBuffer) {
      // Do not cache fallback here; local assets can appear later.
      return FALLBACK_BASE64;
    }

    let quality = 80;
    let outputBuffer: Buffer;

    do {
      outputBuffer = await sharp(inputBuffer)
        .resize(targetSize, targetSize, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .jpeg({ quality, progressive: false })
        .toBuffer();

      if (outputBuffer.byteLength > MAX_BYTES) {
        quality -= 10;
      }
    } while (outputBuffer.byteLength > MAX_BYTES && quality > 20);

    if (outputBuffer.byteLength > MAX_BYTES) {
      const fallbackSize = Math.max(72, Math.floor(targetSize * 0.6));
      outputBuffer = await sharp(inputBuffer)
        .resize(fallbackSize, fallbackSize, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .jpeg({ quality: 60 })
        .toBuffer();
    }

    const base64 = outputBuffer.toString("base64");
    imageCache.set(cacheKey, base64);
    return base64;
  } catch (err) {
    console.warn("navlist image processing error:", imageUrl, err);
    // Avoid pinning transient errors in cache; allow future retries.
    return FALLBACK_BASE64;
  }
}

/**
 * Fetches an image URL, resizes it to a square thumbnail, and returns
 * a raw base64 string suitable for NavigationList start.image.
 * Returns empty string on any failure so the item still renders without image.
 */
export async function toNavListBase64(imageUrl: string): Promise<string> {
  return await buildImageBase64(imageUrl, 200);
}

export async function toSizedBase64(imageUrl: string, size: number): Promise<string> {
  return await buildImageBase64(imageUrl, normalizeTargetSize(size));
}

/**
 * Processes images for a page of products in parallel.
 * Returns a map of product id → base64 string.
 */
export async function prefetchNavListImages(
  products: Array<{ id: string | number; image_src?: string }>,
  size = 200,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const targetSize = normalizeTargetSize(size);

  const concurrency = 2;
  for (let index = 0; index < products.length; index += concurrency) {
    const batch = products.slice(index, index + concurrency);
    await Promise.all(
      batch.map(async (p) => {
      const base64 = await buildImageBase64(p.image_src || "", targetSize);
      results.set(String(p.id), base64);
      }),
    );
  }

  return results;
}