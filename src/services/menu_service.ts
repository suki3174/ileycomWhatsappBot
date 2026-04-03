import { extractPhoneFromFlowToken } from "@/utils/data_parser";
import { normalizeSellerPhone } from "@/utils/seller_auth_helpers";

const MENU_SENDER_ENDPOINT = "/api/seller/menu_template/send";
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000; // base delay — doubles each attempt

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJsonSafe(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw: raw.slice(0, 300) };
  }
}

/**
 * Send the menu template to a seller.
 * Accepts either a phone number directly or a flow token (phone is extracted).
 */
export async function sendMenu(phoneOrToken: string | null): Promise<void> {
  const raw = String(phoneOrToken || "").trim();
  // If it looks like a flow token, extract the phone; otherwise use as-is.
  const phone = raw.match(/^flowtoken-/i)
    ? (extractPhoneFromFlowToken(raw) ?? "")
    : normalizeSellerPhone(raw);
  if (!phone) {
    console.warn(`[sendMenu] No phone resolved from input: ${phoneOrToken}`);
    return;
  }

  //  Send menu with retry
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${baseUrl}${MENU_SENDER_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await readJsonSafe(response);

      if (response.ok) {
        console.log(`[sendMenu] Menu sent to ${phone} (attempt ${attempt})`);
        return; // ✅ success — stop retrying
      }

      console.warn(
        `[sendMenu] Attempt ${attempt}/${MAX_RETRIES} failed for ${phone}:`,
        data
      );

      // Route is missing / wrong path; retries won't help.
      if (response.status === 404) {
        console.error(`[sendMenu] Endpoint not found: ${baseUrl}${MENU_SENDER_ENDPOINT}`);
        return;
      }
    } catch (error) {
      console.error(
        `[sendMenu] Attempt ${attempt}/${MAX_RETRIES} threw for ${phone}:`,
        error
      );
    }

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * 2 ** (attempt - 1); // 1s, 2s, 4s, 8s, 16s
      console.log(`[sendMenu] Retrying in ${delay}ms...`);
      await wait(delay);
    }
  }

  console.error(
    `[sendMenu] All ${MAX_RETRIES} attempts failed for ${phone}. Giving up.`
  );
}
