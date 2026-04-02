import { NextResponse } from "next/server";
import { getAllSellers } from "@/services/auth_service";
import { setSellerCode } from "@/services/auth_service";
import { hashPin } from "@/utils/pin_hash";

export async function POST(req: Request) {
  const { token, password } = await req.json();

  const sellers = getAllSellers();
  const seller = sellers.find(
    sl =>
      sl.reset_token === token &&
      sl.reset_token &&
      sl.reset_token_expiry > Date.now()
  );

  if (!seller) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 400 }
    );
  }

  const hashed = await hashPin(String(password ?? ""));

  // Primary path: persist hashed PIN in plugin state table `code` via flow token.
  if (seller.flow_token) {
    const persisted = await setSellerCode(String(seller.flow_token), String(password ?? ""));
    seller.code = persisted?.code ?? hashed;
  } else {
    // Fallback for local-only seller objects.
    seller.code = hashed;
  }
  seller.reset_token = null;
  seller.reset_token_expiry = null;

  return NextResponse.json({ message: "Password updated" });
}