/**
 * AI Optimization Service
 * Handles calls to the external AI service for product optimization
 */

import {
  AIOptimizationResponse,
  OptimizationStatus,
  OptimizationState,
} from "@/models/ai_optimization_model";
import {
  getOptimizationState,
  setOptimizationState,
  updateOptimizationState,
} from "@/repositories/ai_optimization/ai_optimization_cache";
import { getSellerByPhone } from "@/services/auth_service";

// Configuration from environment
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000/api/optimize";
const AI_SERVICE_TIMEOUT_MS = parseInt(
  process.env.AI_SERVICE_TIMEOUT_MS || "30000",
  10
);
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || "";

/**
 * Trigger AI optimization for a product
 * Only sends productId - AI service will fetch full product details from your backend
 * Returns immediately after submitting request (truly async, non-blocking)
 * 
 * @param productId - Product ID to optimize
 * @param sellerPhone - Seller phone number to send flow to when optimization completes (optional)
 */
export async function triggerProductOptimization(
  productId: string,
  sellerPhone?: string
): Promise<OptimizationState> {

  // Check if already in progress
  const existing = await getOptimizationState(productId);
  if (existing && existing.status === OptimizationStatus.PROCESSING) {
    console.info(`[AI Service] Optimization already in progress for product ${productId}`);
    return existing;
  }

  // Initialize optimization state
  const initialState: OptimizationState = {
    productId,
    sellerPhone,
    status: OptimizationStatus.PENDING,
    requestedAt: Date.now(),
    retryCount: 0,
  };

  await setOptimizationState(productId, initialState);

  try {
    // Send request to AI service (non-blocking, fire-and-forget)
    // The request is queued and returns immediately
    submitToAIService(productId, sellerPhone).catch(async (err) => {
      console.error(`[AI Service] Failed to submit optimization for product ${productId}:`, err);
      await updateOptimizationState(productId, {
        status: OptimizationStatus.FAILED,
        errorMessage: "Failed to submit to AI service",
        completedAt: Date.now(),
      });
    });

    // Update state to processing
    return (await updateOptimizationState(productId, {
      status: OptimizationStatus.PROCESSING,
    })) || initialState;
  } catch (error) {
    console.error(`[AI Service] Error triggering optimization for product ${productId}:`, error);

    await updateOptimizationState(productId, {
      status: OptimizationStatus.FAILED,
      errorMessage: String(error),
      completedAt: Date.now(),
    });

    throw error;
  }
}

/**
 * Get current optimization status for a product
 */
export async function getOptimizationStatus(
  productId: string
): Promise<OptimizationState | null> {
  return getOptimizationState(productId);
}

/**
 * Retrieve optimization result (only if completed)
 */
export async function getOptimizationResult(
  productId: string
): Promise<AIOptimizationResponse | null> {
  const state = await getOptimizationState(productId);

  if (!state) {
    return null;
  }

  if (state.status !== OptimizationStatus.COMPLETED) {
    console.warn(
      `[AI Service] Optimization not completed for product ${productId}. Status: ${state.status}`
    );
    return null;
  }

  return state.result || null;
}

/**
 * Submit optimization request to external AI service
 * Only sends productId - AI service will fetch full product details from your backend via API
 * After completion, triggers the optimizedProductFlow send endpoint
 */
async function submitToAIService(productId: string, sellerPhone?: string): Promise<void> {

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      AI_SERVICE_TIMEOUT_MS
    );

    const response = await fetch(AI_SERVICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AI_SERVICE_API_KEY && {
          Authorization: `Bearer ${AI_SERVICE_API_KEY}`,
        }),
      },
      body: JSON.stringify({ productId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(
        `[AI Service] API returned error status ${response.status} for product ${productId}`
      );
      throw new Error(`AI Service error: ${response.status}`);
    }

    const result: AIOptimizationResponse = await response.json();

    // Store successful result
    await updateOptimizationState(productId, {
      status: OptimizationStatus.COMPLETED,
      result,
      completedAt: Date.now(),
    });

    console.info(
      `[AI Service] Optimization completed for product ${productId}`
    );

    // ─── Trigger optimizedProductFlow send endpoint ────────────────────────
    // After optimization completes, send the flow to the seller
    if (sellerPhone) {
      try {
        await triggerOptimizedProductFlowSend(sellerPhone);
      } catch (err) {
        console.warn(
          `[AI Service] Failed to trigger optimized product flow for ${sellerPhone}:`,
          err
        );
        // Don't fail the optimization if the send fails
      }
    }
    // ────────────────────────────────────────────────────────────────────
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[AI Service] Request timeout for product ${productId}`);
      throw new Error("AI Service request timeout");
    }
    throw error;
  }
}

/**
 * Trigger the optimizedProductFlow send endpoint to send the flow to the seller
 */
async function triggerOptimizedProductFlowSend(sellerPhone: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  // Fetch actual seller info to get the name
  let sellerName = "Seller"; // Fallback
  try {
    const seller = await getSellerByPhone(sellerPhone);
    if (seller?.name) {
      sellerName = seller.name;
    }
  } catch (err) {
    console.warn(`[AI Service] Could not fetch seller name for ${sellerPhone}:`, err);
    // Continue with fallback name
  }

  const response = await fetch(
    `${baseUrl}/api/seller/optimizedProductFlow/send`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seller: {
          phone: sellerPhone,
          name: sellerName,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to send optimized product flow: ${response.status}`
    );
  }

  const responseData = await response.json();
  console.info(
    `[AI Service] Optimized product flow sent to ${sellerPhone} (${sellerName}):`,
    responseData
  );
}

/**
 * Retry optimization for a failed product
 */
export async function retryProductOptimization(
  productId: string,
  sellerPhone?: string
): Promise<OptimizationState> {
  const state = await getOptimizationState(productId);

  if (!state) {
    throw new Error(`No optimization state found for product ${productId}`);
  }

  const maxRetries = 3;
  if (state.retryCount >= maxRetries) {
    throw new Error(
      `Maximum retries (${maxRetries}) exceeded for product ${productId}`
    );
  }

  // Update retry count and reset status
  await updateOptimizationState(productId, {
    status: OptimizationStatus.PENDING,
    retryCount: state.retryCount + 1,
  });

  // Try again
  return triggerProductOptimization(productId, sellerPhone);
}
