// @/app/api/forgot_code/route.ts
import { NextResponse } from "next/server";
import { sendResetEmail } from "@/services/reset_code_service";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const ok = await sendResetEmail(email);
    if (!ok) {
      // Either seller not found or sending failed. Log and surface failure.
      console.warn("Reset email not sent", { email });
      return NextResponse.json(
        { error: "Email not found or failed to send" },
        { status: 422 }
      );
    }

    console.log("Reset email sent to:", email);
    return NextResponse.json({ message: "Reset email sent" }, { status: 200 });
  } catch (error) {
    console.error("Error sending reset email:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}