/* eslint-disable @typescript-eslint/no-explicit-any */
import { isValidEmail } from "@/utils/utilities"
import {
  isValidPinCodeFormat,
  sellerHasCode,
  setSellerCode,
  verifyCode,
  verifySellerEmail,
  activateSession
} from "@/services/auth_service";
import { findSellerByFlowToken } from "@/repositories/seller_repo";
import { sendResetEmail } from "@/services/reset_code_service";
import { error } from "console";

export interface FlowRequest {
  action?: string;
  screen?: string;
  data?: Record<string, any>;
  flow_token?: string;
  version?: string;
}

export interface FlowResponse {
  screen: string;
  data: Record<string, any>;
}

/* -------------------------------- */
/* Utilities */
/* -------------------------------- */
function getFlowToken(parsed: FlowRequest): string {
  const t = parsed?.data?.flow_token ?? parsed?.flow_token ?? "";
  return typeof t === "string" ? t.trim() : String(t).trim();
}






/* -------------------------------- */
/* WELCOME */
/* -------------------------------- */

async function handleWelcome(parsed: FlowRequest): Promise<FlowResponse> {
  // Ensure we correctly determine whether the seller already has a code
  try {
    const token = getFlowToken(parsed);
    const hasCode = !!token && sellerHasCode(token);

    if (hasCode) {
      return {
        screen: "SIGN_IN",
        data: { error_msg: "" },
      };
    }

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
  const pin = String(data.pin_code ?? "");

  // Explicitly log evaluation path for diagnostics
  // Note: keep logs minimal to avoid leaking secrets
  try {
    // Forgot password clicked
    if (data.user_action === "forgot_password_clicked") {
      return {
        screen: "FORGOT_PASSWORD",
        data: { error_msg: "" },
      };
    }

    if (!isValidPinCodeFormat(pin)) {
      return {
        screen: "SIGN_IN",
        data: {
          error_msg: "Le code doit contenir exactement 4 chiffres.",
        },
      };
    }

    const token = getFlowToken(parsed);
    const isValid = verifyCode(token, pin);

    if (!isValid) {
      return {
        screen: "SIGN_IN",
        data: { error_msg: "Code incorrect." },
      };
    }

    // ✅ END FLOW on success
    activateSession(token);
    return {
      screen: "SUCCESS",
      data: {
        message: "Connexion réussie.",
      },
    };
  } catch (e) {
    // On unexpected error, fail safe by staying on SIGN_IN
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
  const pin = String(data.pin_code ?? "");
  const confirm = String(data.confirm_pin_code ?? "");



  if (!isValidPinCodeFormat(pin)) {
    return {
      screen: "SIGN_UP",
      data: {
        error_msg: "Le code doit contenir exactement 4 chiffres."
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

  setSellerCode(getFlowToken(parsed), pin);

  // ✅ After signup → go to SIGN_IN
  return {
    screen: "SIGN_IN",
    data: {
      error_msg: ""
    },
  };
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
  const isValid = verifySellerEmail(getFlowToken(parsed), email);

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
  const action = (parsed.action || "").toUpperCase();

  

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