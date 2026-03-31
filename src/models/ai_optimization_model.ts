/**
 * AI Optimization Models
 * Handles state and responses for product AI optimization
 */

export enum OptimizationStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * Request sent to external AI service
 * Only product ID is sent - the AI service will fetch full product data from your backend
 */
export interface AIOptimizationRequest {
  productId: string;
}

/**
 * Response from external AI service
 */
export interface AIOptimizationResponse {
  productId: string;
  optimizedName?: string;
  optimizedShortDescription?: string;
  optimizedFullDescription?: string;
  suggestedTags?: string[];
  suggestedCategories?: string[];
  confidence?: number;
  processingTimeMs?: number;
}

/**
 * Internal state tracking optimization progress
 */
export interface OptimizationState {
  productId: string;
  sellerPhone?: string; // Phone number to send flow to when optimization completes
  status: OptimizationStatus;
  requestedAt: number;
  completedAt?: number;
  result?: AIOptimizationResponse;
  errorMessage?: string;
  retryCount: number;
  expiresAt?: number; // Cache expiration timestamp
}
