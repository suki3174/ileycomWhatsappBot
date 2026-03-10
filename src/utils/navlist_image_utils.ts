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

const MAX_BYTES = 90_000; // 90KB — leave headroom under 100KB limit
const TARGET_SIZE = 200;  // 200×200px square thumbnail
const FALLBACK_BASE64 = ""; // empty string = no image shown (WhatsApp ignores empty)

// In-memory cache: image URL → base64 string
// Keyed by URL, value is the processed base64 or empty string on failure
const imageCache = new Map<string, string>();

/**
 * Fetches an image URL, resizes it to a square thumbnail, and returns
 * a raw base64 string suitable for NavigationList start.image.
 * Returns empty string on any failure so the item still renders without image.
 */
export async function toNavListBase64(imageUrl: string): Promise<string> {
  if (!imageUrl) return FALLBACK_BASE64;

  const cached = imageCache.get(imageUrl);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(5000), // 5s timeout per image
    });

    if (!response.ok) {
      console.warn("navlist image fetch failed:", imageUrl, response.status);
      imageCache.set(imageUrl, FALLBACK_BASE64);
      return FALLBACK_BASE64;
    }

    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Resize to square thumbnail and output as JPEG
    let quality = 80;
    let outputBuffer: Buffer;

    do {
      outputBuffer = await sharp(inputBuffer)
        .resize(TARGET_SIZE, TARGET_SIZE, {
          fit: "cover",
          position: "centre",
        })
        .jpeg({ quality, progressive: false })
        .toBuffer();

      // If still too large, reduce quality in steps
      if (outputBuffer.byteLength > MAX_BYTES) {
        quality -= 10;
      }
    } while (outputBuffer.byteLength > MAX_BYTES && quality > 20);

    if (outputBuffer.byteLength > MAX_BYTES) {
      // Last resort: shrink dimensions
      outputBuffer = await sharp(inputBuffer)
        .resize(100, 100, { fit: "cover", position: "centre" })
        .jpeg({ quality: 60 })
        .toBuffer();
    }

    const base64 = outputBuffer.toString("base64");
    imageCache.set(imageUrl, base64);
    return base64;
  } catch (err) {
    console.warn("navlist image processing error:", imageUrl, err);
    imageCache.set(imageUrl, FALLBACK_BASE64);
    return FALLBACK_BASE64;
  }
}

/**
 * Processes images for a page of products in parallel.
 * Returns a map of product id → base64 string.
 */
export async function prefetchNavListImages(
  products: Array<{ id: string | number; image_src?: string }>,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  await Promise.all(
    products.map(async (p) => {
      const base64 = await toNavListBase64(p.image_src || "");
      results.set(String(p.id), base64);
    }),
  );

  return results;
}