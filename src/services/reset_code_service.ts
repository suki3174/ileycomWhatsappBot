/* eslint-disable @typescript-eslint/no-explicit-any */
// @/services/reset_code_service.ts
import { generateResetToken } from "@/utils/utilities";
import { setResetToken } from "@/repositories/seller_repo";
import { sendEmail } from "@/utils/mail";

export async function sendResetEmail(email: string): Promise<boolean> {
  const token = generateResetToken();
  const expiry = Date.now() + 1000 * 60 * 15; // 15 min

  const seller = await setResetToken(email, token, expiry);
console.log(seller)
  // If seller doesn't exist, we return false but don't crash 
  // (Standard security practice to prevent email enumeration)
  if (!seller) return false;

  const base = process.env.BASE_URL || "http://localhost:3000";
  const resetUrl = new URL("/reset_code", base);
  resetUrl.searchParams.set("token", token);
  const resetLink = resetUrl.toString();

  try {
    console.log("Sending reset email", { to: email, resetLink });
    const info = await sendEmail({
      to: email, // Use the passed email directly
      subject: "Changez votre mot de passe",
      html: `
        <h2>Nouveau mot de passe</h2>
        <p>Clicker sur le lien suivant pour changer votre mot de passe</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>Le lien expire dans 15 minutes.</p>
      `,
      category: "Password Reset",
    });
    console.log("Reset email sent", { to: email, messageId: (info as any)?.messageId, response: (info as any)?.response });
    return true;
  } catch (err) {
    console.error("Failed to send reset email", { to: email, err });
    return false;
  }
}