
const MENU_SENDER_ENDPOINT = "/api/seller/menuFlow/send";
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000; // base delay — doubles each attempt

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendMenu(token : string | null): Promise<void> {
  

  //  Send menu with retry
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${baseUrl}${MENU_SENDER_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`[sendMenu] Menu sent to ${token} (attempt ${attempt})`);
        return; // ✅ success — stop retrying
      }

      console.warn(
        `[sendMenu] Attempt ${attempt}/${MAX_RETRIES} failed for ${token}:`,
        data
      );
    } catch (error) {
      console.error(
        `[sendMenu] Attempt ${attempt}/${MAX_RETRIES} threw for ${token}:`,
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
    `[sendMenu] All ${MAX_RETRIES} attempts failed for ${token}}. Giving up.`
  );
}
