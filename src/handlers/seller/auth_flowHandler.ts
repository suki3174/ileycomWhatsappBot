/* eslint-disable @typescript-eslint/no-unused-vars */
import { getFlowToken, isValidEmail } from "@/utils/core_utils"
import { extractPhoneFromFlowToken } from "@/utils/data_parser";
import { findSellerStateByPhone } from "@/repositories/auth/seller_repo";
import {
  prepareSellerState,
  setSellerCode,
  verifyCode,
  verifySellerEmail,
  startSellerSession,
} from "@/services/auth_service";
import { isPinStrong, isSupportedSellerPhone } from "@/utils/seller_auth_helpers";
import { sendResetEmail } from "@/services/reset_code_service";
import { markResetEmailSendSeen } from "@/services/cache/auth_cache_service";
import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";
import { sendMenu } from "@/services/menu_service";




/* -------------------------------- */
/* WELCOME */
/* -------------------------------- */


/**
 * Resolves the initial auth screen for a token by validating phone support and
 * reading seller state from the state table fast path. It routes registered
 * sellers to SIGN_IN and unregistered sellers to SIGN_UP, with a safe fallback
 * to SIGN_UP if lookup or parsing fails.
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

    // Validate phone belongs to one of the bot-supported markets.
    if (!isSupportedSellerPhone(phone)) {
      return {
        screen: "SIGN_UP",
        data: { error_msg: "Numero non valide. Seuls les numeros tunisiens et francais sont acceptes." },
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

/**
 * Validates signin intent, checks PIN correctness, and transitions to SUCCESS
 * when authentication passes. Session activation and menu send are executed in
 * the background so flow navigation is not blocked by secondary network calls.
 */
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
    
    // Validate phone belongs to one of the bot-supported markets before signin process.
    const phoneFromToken = extractPhoneFromFlowToken(token);
    if (!phoneFromToken || !isSupportedSellerPhone(phoneFromToken)) {
      return {
        screen: "SIGN_IN",
        data: { error_msg: "Numero non valide. Seuls les numeros tunisiens et francais sont acceptes." },
      };
    }
    
    // Verify PIN against seller_state
    const isValid = await verifyCode(token, pin);
    if (!isValid) {
      return {
        screen: "SIGN_IN",
        data: { error_msg: "Code incorrect." },
      };
    }

    // Do not block flow transition on network side effects.
    void (async () => {
      try {
        await startSellerSession(token);
      } catch (err) {
        console.error("SIGN_IN session activation failed", err);
      }

      try {
        await sendMenu(token);
      } catch (err) {
        console.error("SIGN_IN menu send failed", err);
      }
    })();

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

/**
 * Registers or updates seller credentials by validating PIN input and supported
 * phone constraints, then attempting code update first for latency. If update
 * fails, it prepares state and retries once, returning explicit user-facing
 * errors when vendor linkage or code persistence cannot be confirmed.
 */
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

  // Validate phone belongs to one of the bot-supported markets before signup process.
  const phoneFromToken = extractPhoneFromFlowToken(token);
  if (!phoneFromToken || !isSupportedSellerPhone(phoneFromToken)) {
    return {
      screen: "SIGN_UP",
      data: { error_msg: "Numero non valide. Seuls les numeros tunisiens et francais sont acceptes." },
    };
  }

  try {
    // Step 1: Try direct code update first (fast path).
    const setCodeStartedAt = Date.now();
    let codeUpdated = await setSellerCode(token, pin);
    console.log("SIGN_UP setSellerCode first attempt completed", {
      codeUpdated: !!codeUpdated,
      durationMs: Date.now() - setCodeStartedAt,
    });

    // Step 2: If update failed, prepare state then retry code update once.
    if (!codeUpdated) {
      const stateInsertStartedAt = Date.now();
      let inserted = await prepareSellerState(token);
      if (!inserted) {
        inserted = await prepareSellerState(token);
      }
      console.log("SIGN_UP prepareSellerState completed", {
        inserted,
        durationMs: Date.now() - stateInsertStartedAt,
      });
      if (!inserted) {
        return {
          screen: "SIGN_UP",
          data: { error_msg: "Numero non lie a un vendeur. Contactez l'administrateur pour associer ce numero." },
        };
      }

      const retrySetCodeStartedAt = Date.now();
      codeUpdated = await setSellerCode(token, pin);
      console.log("SIGN_UP setSellerCode retry completed", {
        codeUpdated: !!codeUpdated,
        durationMs: Date.now() - retrySetCodeStartedAt,
      });
      if (!codeUpdated) {
        return {
          screen: "SIGN_UP",
          data: { error_msg: "Erreur lors de la configuration du code. Réessayez." },
        };
      }
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
/**
 * Handles password reset initiation by validating email syntax, verifying email
 * ownership for the current flow token, and sending a reset message with dedupe
 * protection. It returns deterministic screen responses for invalid email,
 * duplicate send, delivery failure, and successful dispatch.
 */
async function handleForgotPassword(parsed: FlowRequest): Promise<FlowResponse> {
  const data = parsed.data || {};
  const email = String(data.email ?? "").toLowerCase().trim();
  const flowToken = getFlowToken(parsed);

  if (!isValidEmail(email)) {
    return {
      screen: "FORGOT_PASSWORD",
      data: { error_msg: "Format email invalide." },
    };
  }

  // 1. Check if the email is associated with the seller
  const isValid = await verifySellerEmail(flowToken, email);

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
    const duplicateSend = await markResetEmailSendSeen(flowToken, email);
    if (duplicateSend) {
      return {
        screen: "SUCCESS",
        data: { message: "Lien de réinitialisation déjà envoyé. Vérifiez votre boîte mail." },
      };
    }

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

/**
 * Central dispatcher for auth flow actions and screens.
 * INIT and NAVIGATE warm state asynchronously before returning WELCOME, while
 * DATA_EXCHANGE delegates to screen-specific handlers and normalizes unknown
 * actions/screens to a safe WELCOME response.
 */
export async function handleAuthFlow(
  parsed: FlowRequest
): Promise<FlowResponse> {
  const rawAction = parsed.action || "";
  const action = rawAction.toUpperCase();
  const token = getFlowToken(parsed);

  // INIT / NAVIGATE: warm up seller state without blocking.
  if (action === "INIT" || action === "NAVIGATE") {
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