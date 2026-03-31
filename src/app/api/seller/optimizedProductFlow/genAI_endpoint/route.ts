/**
 * AI Optimization Endpoint
 * Internal endpoint to trigger product optimization via AI service
 * POST /api/seller/optimizedProductFlow/genAI_endpoint
 * 
 * Request body:
 * {
 *   productId: string,
 *   sellerPhone?: string
 * }
 * 
 * Response (202 Accepted):
 * {
 *   success: true,
 *   status: "processing",
 *   productId: string,
 *   message: string,
 *   requestedAt: number
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  triggerProductOptimization,
  getOptimizationStatus,
  getOptimizationResult,
} from "@/services/ai_optimization_service";
import { AIOptimizationResponse } from "@/models/ai_optimization_model";

interface OptimizationStatusResponse {
  status: string;
  productId: string;
  requestedAt: number;
  completedAt?: number;
  result?: AIOptimizationResponse;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Validate required fields
    if (!payload.productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    const productId = String(payload.productId).trim();
    const sellerPhone = payload.sellerPhone ? String(payload.sellerPhone).trim() : undefined;

    console.info(`[genAI_endpoint] Received optimization request for product ${productId}${sellerPhone ? ` (seller: ${sellerPhone})` : ""}`);

    // Trigger optimization (async, non-blocking - fire and forget)
    const state = await triggerProductOptimization(productId, sellerPhone);

    return NextResponse.json(
      {
        success: true,
        status: state.status,
        productId: state.productId,
        message: `Product optimization ${state.status}`,
        requestedAt: state.requestedAt,
      },
      { status: 202 } // 202 Accepted
    );
  } catch (error) {
    console.error("[genAI_endpoint] Error:", error);
    return NextResponse.json(
      { error: "Failed to trigger optimization", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check optimization status
 * GET /api/seller/optimizedProductFlow/genAI_endpoint?productId={productId}
 */
export async function GET(req: NextRequest) {
  try {
    const productId = req.nextUrl.searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { error: "productId query parameter is required" },
        { status: 400 }
      );
    }

    console.info(`[genAI_endpoint] Checking status for product ${productId}`);

    const status = getOptimizationStatus(productId);

    if (!status) {
      return NextResponse.json(
        { error: "No optimization found for this product", productId },
        { status: 404 }
      );
    }

    const response: OptimizationStatusResponse = {
      status: status.status,
      productId: status.productId,
      requestedAt: status.requestedAt,
      completedAt: status.completedAt,
    };

    // Include result if completed
    if (status.status === "completed") {
      response.result = getOptimizationResult(productId) || undefined;
    }

    // Include error if failed
    if (status.status === "failed") {
      response.error = status.errorMessage;
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("[genAI_endpoint] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve status", details: String(error) },
      { status: 500 }
    );
  }
}
