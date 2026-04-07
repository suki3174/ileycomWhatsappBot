import { NextResponse } from "next/server";
import { setSellerCode } from "@/services/auth_service";
import { findSellerByFlowToken } from "@/repositories/auth/seller_repo";
import {
  consumeFlowTokenByResetToken,
  peekFlowTokenByResetToken,
} from "@/services/cache/reset_token_cache_service";

export async function POST(req: Request) {
  const { token, password } = await req.json();
  const resetToken = String(token || "").trim();
  const newPassword = String(password || "").trim();

  if (!resetToken || !newPassword) {
    return NextResponse.json(
      { error: "token and password are required" },
      { status: 400 }
    );
  }

  const mappedFlowToken = await peekFlowTokenByResetToken(resetToken);
  if (!mappedFlowToken) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 400 }
    );
  }

  // IMPORTANT: bypass auth-session cache here because reset_token is freshly updated
  // and cached snapshots can lag behind the latest plugin state.
  const seller = await findSellerByFlowToken(mappedFlowToken);

  const expiry = Number((seller as { reset_token_expiry?: number | null } | undefined)?.reset_token_expiry || 0);
  const persistedResetToken = String((seller as { reset_token?: string | null } | undefined)?.reset_token || "").trim();
  const isValid = !!seller && persistedResetToken !== "" && persistedResetToken === resetToken && expiry > Date.now();
  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 400 }
    );
  }

  // Consume token mapping only after we have positively validated seller state.
  await consumeFlowTokenByResetToken(resetToken);

  // Persist hashed PIN in plugin state table `code` via flow token.
  if (seller.flow_token) {
    const persisted = await setSellerCode(String(seller.flow_token), newPassword);
    if (!persisted) {
      return NextResponse.json(
        { error: "Failed to update PIN" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: "Password updated" });
}