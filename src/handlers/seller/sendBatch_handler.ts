import { Seller } from "@/models/seller_model";

const AUTH_FLOW_ENDPOINT = "/api/seller/authFlow/send";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 5;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Single seller send with retry ───────────────────────────────────────────

export async function sendAuthFlowToSeller(seller: Seller): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${baseUrl}${AUTH_FLOW_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`[authFlow] ✅ Sent to ${seller.name} (attempt ${attempt})`);
        return;
      }

      console.warn(
        `[authFlow] ⚠️ Attempt ${attempt}/${MAX_RETRIES} failed for ${seller.name}:`,
        data
      );
    } catch (error) {
      console.error(
        `[authFlow] ❌ Attempt ${attempt}/${MAX_RETRIES} threw for ${seller.name}:`,
        error
      );
    }

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * 2 ** (attempt - 1);
      await wait(delay);
    }
  }

  throw new Error(`All retries exhausted for ${seller.name}`);
}

// ─── Batch sender ─────────────────────────────────────────────────────────────

export async function sendAuthFlowToAllSellers(
  sellers: Seller[]
): Promise<{ success: number; failed: number; failures: string[] }> {
  const results = { success: 0, failed: 0, failures: [] as string[] };
  const totalBatches = Math.ceil(sellers.length / BATCH_SIZE);

  for (let i = 0; i < sellers.length; i += BATCH_SIZE) {
    const batch = sellers.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    console.log(
      `[authFlow] Batch ${batchNumber}/${totalBatches} — ${batch.length} sellers`
    );

    const settled = await Promise.allSettled(
      batch.map((seller) => sendAuthFlowToSeller(seller))
    );

    settled.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        results.success++;
      } else {
        results.failed++;
        results.failures.push(batch[idx].name);
      }
    });

    if (i + BATCH_SIZE < sellers.length) {
      await wait(BATCH_DELAY_MS);
    }
  }

  return results;
}


