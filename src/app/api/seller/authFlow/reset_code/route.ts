import { NextResponse } from "next/server";
import { getAllSellers } from "@/services/auth_service";

export async function POST(req: Request) {
  const { token, password } = await req.json();

  const sellers = getAllSellers();
  const seller = sellers.find(
    sl =>
      sl.reset_token === token &&
      sl.reset_token_expiry &&
      sl.reset_token_expiry > Date.now()
  );

  if (!seller) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 400 }
    );
  }

  seller.code = password; // ⚠️ hash later
  seller.reset_token = null;
  seller.reset_token_expiry = null;

  return NextResponse.json({ message: "Password updated" });
}