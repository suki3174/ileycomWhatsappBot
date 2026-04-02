import { sendAuthFlowToAllSellers } from "@/handlers/seller/sendBatch_handler";
import { Seller } from "@/models/seller_model";
import { getAllSellers } from "@/services/auth_service";
import {  NextResponse } from "next/server";

export async function POST() {
    const sellers: Seller[] = getAllSellers()
  
    if (!sellers || !Array.isArray(sellers) || sellers.length === 0) {
      return NextResponse.json(
        { error: "sellers array is required in request body" },
        { status: 400 }
      );
    }
  
    try {
      const results = await sendAuthFlowToAllSellers(sellers)
  
      return NextResponse.json({
        total: sellers.length,
        success: results.success,
        failed: results.failed,
        failures: results.failures,   // names of sellers that ultimately failed
      });
    } catch (error) {
      console.error("[authFlow/batch] Unexpected error:", error);
      return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
    }
  }