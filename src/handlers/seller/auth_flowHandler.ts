/* eslint-disable @typescript-eslint/no-unused-vars */
import { getFlowToken, isValidEmail } from "@/utils/utilities"
import { extractPhoneFromFlowToken } from "@/utils/repository_utils";
import { findSellerStateByPhone } from "@/repositories/seller_repo";
import {
  prepareSellerState,
  sellerHasCodeByFlowToken,
  setSellerCode,
  verifyCode,
  verifySellerEmail,
  startSellerSession,
} from "@/services/auth_service";
import { isPinStrong } from "@/utils/auth_utils";
import { sendResetEmail } from "@/services/reset_code_service";
import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";




/* -------------------------------- */
/* WELCOME */
/* -------------------------------- */
/* OPTIMIZATION: Use state-table-only phone lookup (fast path) instead of vendor-joined lookup.
   This removes dependency on heavy wp_users/wp_usermeta joins and avoids cache misses on first run.
   Phone 50354773 must be registered in wp_cwsb_seller_state table AND linked to a wp_vendor.
   See: findSellerStateByPhone() for the direct state-table path.
*/
async function handleWelcome(parsed: FlowRequest): Promise<FlowResponse> {
  try {
    const token = getFlowToken(parsed);
    if (!token) {
      return {
        screen: "SIGN_UP",
        data: { error_msg: "" },
      };
    }

    // Extract phone from flow token and search seller_state
    const phone = extractPhoneFromFlowToken(token);
    
    if (!phone) {
      return {
        screen: "SIGN_UP",
        data: { error_msg: "" },
      };
    }

    // OPTIMIZATION: Resolve auth screen directly from state table by phone.
    // This uses /seller/state/by-phone endpoint which queries only wp_cwsb_seller_state table.
    // No cache dependency, works on first run after app restart.
    const seller = await findSellerStateByPhone(phone);
    const hasCode = !!seller?.code && String(seller.code).trim() !== "";
    
    // Route: if seller has a code, they're already registered → SIGN_IN
    // Otherwise → SIGN_UP to create account and set PIN code
    if (hasCode) {
      return {
        screen: "SIGN_IN",
        data: { error_msg: "" },
      };
    }

    console.log("WELCOME state-table lookup completed", {
      phone,
      found: !!seller,
      hasCode,
    });
    return {
      screen: "SIGN_UP",
      data: { error_msg: "" },
    };
  } catch (_e) {
    // Fail-safe: if any error occurs, default to SIGN_UP but do not crash the flow
    return {
      screen: "SIGN_UP",
      data: { error_msg: "" },
    };
  }
}

/* -------------------------------- */
/* SIGN IN */
/* -------------------------------- */

async function handleSignIn(parsed: FlowRequest): Promise<FlowResponse> {
  const data = parsed.data || {};
  const pin = String(data.pin_code ?? "").trim();

  try {
    // Forgot password clicked
    if (data.user_action === "forgot_password_clicked") {
      return {
        screen: "FORGOT_PASSWORD",
        data: { error_msg: "" },
      };
    }

    const token = getFlowToken(parsed);
    
    // Verify PIN against seller_state
    const isValid = await verifyCode(token, pin);
    if (!isValid) {
      return {
        screen: "SIGN_IN",
        data: { error_msg: "Code incorrect." },
      };
    }

    // Update session_active_until timestamp (runs in background)
    await startSellerSession(token);
    
    return {
      screen: "SUCCESS",
      data: { message: "Connexion réussie." },
    };
  } catch (e) {
    console.error("SIGN_IN handler error", e);
    return {
      screen: "SIGN_IN",
      data: { error_msg: "Une erreur est survenue. Réessayez." },
    };
  }
}

/* -------------------------------- */
/* SIGN UP */
/* -------------------------------- */

async function handleSignUp(parsed: FlowRequest): Promise<FlowResponse> {
  const data = parsed.data || {};
  const pin = String(data.pin_code ?? "").trim();
  const confirm = String(data.confirm_pin_code ?? "").trim();
  const token = getFlowToken(parsed);

  if (!token) {
    return {
      screen: "SIGN_UP",
      data: { error_msg: "Token invalide." },
    };
  }

  // Validate PIN requirements
  if (!isPinStrong(pin)) {
    return {
      screen: "SIGN_UP",
      data: {
        error_msg: "Code pas assez fort. Veuillez choisir un code plus complexe.",
      },
    };
  }

  if (pin !== confirm) {
    return {
      screen: "SIGN_UP",
      data: {
        error_msg: "Les codes ne correspondent pas."
      },
    };
  }

  try {
    // OPTIMIZATION: Guard against duplicate signup attempts.
    // Use flow-token-only check (sellerHasCodeByFlowToken) instead of phone fallback.
    // This avoids the slow /seller/by-phone lookup (~7-8s) in SIGN_UP critical path.
    // Phone fallback is removed; only check current flow-token binding.
    const alreadyRegistered = await sellerHasCodeByFlowToken(token);
    if (alreadyRegistered) {
      return {
        screen: "SIGN_IN",
        data: { error_msg: "Compte deja inscrit. Connectez-vous avec votre code." },
      };
    }

    // Step 1: Insert seller into seller_state (without code).
    // OPTIMIZATION: upsertSellerState now has state-table-first path that returns state rows directly,
    // avoiding null response when vendor-join resolution is slow/flaky.
    // If seller null despite HTTP 200, recovery path does state-by-phone read-back.
    const stateInsertStartedAt = Date.now();
    const inserted = await prepareSellerState(token);
    console.log("SIGN_UP prepareSellerState completed", {
      inserted,
      durationMs: Date.now() - stateInsertStartedAt,
    });
    if (!inserted) {
      return {
        screen: "SIGN_UP",
        // Clear error message: phone must be registered in DB before signup can proceed.
        data: { error_msg: "Numero non lie a un vendeur. Contactez l'administrateur pour associer ce numero." },
      };
    }

    // Step 2: Update the code for this seller.
    // OPTIMIZATION: This call is non-blocking in background on success.
    // Code is hashed before persistence (bcrypt via pinHash utility).
    const setCodeStartedAt = Date.now();
    const codeUpdated = await setSellerCode(token, pin);
    console.log("SIGN_UP setSellerCode completed", {
      codeUpdated: !!codeUpdated,
      durationMs: Date.now() - setCodeStartedAt,
    });
    if (!codeUpdated) {
      return {
        screen: "SIGN_UP",
        data: { error_msg: "Erreur lors de la configuration du code. Réessayez." },
      };
    }

    // Step 3: Go to SIGN_IN
    return {
      screen: "SIGN_IN",
      data: { error_msg: "" },
    };
  } catch (err) {
    console.error("SIGN_UP handler error", err);
    return {
      screen: "SIGN_UP",
      data: { error_msg: "Une erreur est survenue. Réessayez." },
    };
  }
}

/* -------------------------------- */
/* FORGOT PASSWORD */
/* -------------------------------- */

// authHandler logic
async function handleForgotPassword(parsed: FlowRequest): Promise<FlowResponse> {
  const data = parsed.data || {};
  const email = String(data.email ?? "").toLowerCase().trim();

  if (!isValidEmail(email)) {
    return {
      screen: "FORGOT_PASSWORD",
      data: { error_msg: "Format email invalide." },
    };
  }

  // 1. Check if the email is associated with the seller
  const isValid = await verifySellerEmail(getFlowToken(parsed), email);

  if (!isValid) {
    return {
      screen: "FORGOT_PASSWORD",
      data: { error_msg: "Email incorrect." },
    };
  }
console.log(email)
  // 2. Trigger the email service
  // We don't await this if we want a fast UI response, 
  // but usually, it's safer to await to handle SMTP errors.
  try {
    const ok = await sendResetEmail(email);
    if (!ok) {
 return {
        screen: "FORGOT_PASSWORD", // Transition to your next screen
        data: { error_msg: "Lien non envoyé" },
      };    }
    else {
      return {
        screen: "SUCCESS", // Transition to your next screen
        data: { message: "Lien de réinitialisation envoyé\nCe lien expire dans 15 minutes." },
      };
    }

    // 3. Move to the next screen in your flow

  } catch (error) {
    return {
      screen: "FORGOT_PASSWORD",
      data: { error_msg: "Erreur lors de l'envoi de l'email." },
    };
  }
}

/* -------------------------------- */
/* MAIN HANDLER */
/* -------------------------------- */

export async function handleAuthFlow(
  parsed: FlowRequest
): Promise<FlowResponse> {
  const rawAction = parsed.action || "";
  const action = rawAction.toUpperCase();

  // INIT / NAVIGATE: warm up seller state without blocking.
  if (action === "INIT" || action === "NAVIGATE") {
    const token = getFlowToken(parsed);
    if (token) {
      void prepareSellerState(token);
    }

    return {
      screen: "WELCOME",
      data: { error_msg: "" },
    };
  }

  if (action === "DATA_EXCHANGE") {
    switch (parsed.screen) {
      case "WELCOME":

        return handleWelcome(parsed);


      case "SIGN_IN":

        return handleSignIn(parsed);

      case "SIGN_UP":

        return handleSignUp(parsed);

      case "FORGOT_PASSWORD":

        return handleForgotPassword(parsed);

      default:

        return {
          screen: "WELCOME",
          data: { error_msg: "" },
        };
    }

  }

  return {
    screen: "WELCOME",
    data: { error_msg: "" },
  };

}

export default handleAuthFlow;