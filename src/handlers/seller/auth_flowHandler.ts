/* eslint-disable @typescript-eslint/no-explicit-any */
import{isValidEmail } from "@/utils/utilities"
import {
  isValidPinCodeFormat,
  sellerHasCode,
  setSellerCode,
  verifyCode,
  verifySellerEmail,
  activateSession
} from "@/services/auth_service";
import { findSellerByFlowToken } from "@/repositories/seller_repo";

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
        flow_completed: true,
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

async function handleForgotPassword(parsed: FlowRequest): Promise<FlowResponse> {
  const data = parsed.data || {};
  const email = String(data.email ?? "");

  

  if (!isValidEmail(email)) {
    return {
      screen: "FORGOT_PASSWORD",
      data: { error_msg: "Format email invalide." },
    };
  }

  const isValid = verifySellerEmail(getFlowToken(parsed), email);

  if (!isValid) {
    return {
      screen: "FORGOT_PASSWORD",
      data: { error_msg: "Email incorrect." },
    };
  }

  // ✅ END FLOW after success
  return {
    screen: "SUCCESS",
    data: {
      flow_completed: true,
      reset_allowed: true,
    },
  };
}

/* -------------------------------- */
/* MAIN HANDLER */
/* -------------------------------- */

export async function handleAuthFlow(
  parsed: FlowRequest
): Promise<FlowResponse> {
  const action = (parsed.action || "").toUpperCase();

  if (action === "PING") {
    return { screen: "PING", data: { status: "active" } };
  }

  if (action === "DATA_EXCHANGE") {
    switch (parsed.screen) {
      case "WELCOME":
         console.log(findSellerByFlowToken(getFlowToken(parsed)));

        return handleWelcome(parsed);


      case "SIGN_IN":
                 console.log(findSellerByFlowToken(getFlowToken(parsed)));

        return handleSignIn(parsed);

      case "SIGN_UP":
                 console.log(findSellerByFlowToken(getFlowToken(parsed)));

        return handleSignUp(parsed);

      case "FORGOT_PASSWORD":
                 console.log(findSellerByFlowToken(getFlowToken(parsed)));

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