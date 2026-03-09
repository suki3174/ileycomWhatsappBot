/* eslint-disable @typescript-eslint/no-unused-vars */
import { getFlowToken, isValidEmail } from "@/utils/utilities"
import {
  isPinStrong,
  ensureSellerState,
  sellerHasCode,
  setSellerCode,
  verifyCode,
  verifySellerEmail,
  activateSession,
  primeAuthWarmupAsync,
} from "@/services/auth_service";
import { sendResetEmail } from "@/services/reset_code_service";
import { cachePendingCode, getCachedAuthDecision, updateAuthWarmupCache } from "@/repositories/auth_cache";
import { FlowRequest } from "@/models/flowRequest";
import { FlowResponse } from "@/models/flowResponse";




/* -------------------------------- */
/* WELCOME */
/* -------------------------------- */

async function handleWelcome(parsed: FlowRequest): Promise<FlowResponse> {
  // Ensure we correctly determine whether the seller already has a code
  try {
    const token = getFlowToken(parsed);
    if (!token) {
      return {
        screen: "SIGN_UP",
        data: { error_msg: "" },
      };
    }

    const cached = getCachedAuthDecision(token);
    // Cached true is safe to trust. Cached false can be stale right after signup,
    // so re-check backend before deciding to stay on SIGN_UP.
    const hasCode = cached?.hasCode === true
      ? true
      : await sellerHasCode(token);

    updateAuthWarmupCache(token, {
      hasCode,
      preparedAt: Date.now(),
    });

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

    

    const token = getFlowToken(parsed);
    const isValid = await verifyCode(token, pin);

    if (!isValid) {
      return {
        screen: "SIGN_IN",
        data: { error_msg: "Code incorrect." },
      };
    }

    // ✅ END FLOW on success
    await activateSession(token);
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

  // Some flow definitions reject direct SIGN_UP -> SIGN_IN transitions.
  // If client reports this, keep user on SIGN_UP with a clear instruction.
  if (data.error === "invalid-screen-transition") {
    return {
      screen: "SIGN_UP",
      data: {
        error_msg: "Compte deja configure. Utilisez l'ecran de connexion.",
      },
    };
  }



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

  const token = getFlowToken(parsed);
  // Optimistic signup: cache pin and redirect immediately for better UX latency.
  cachePendingCode(token, pin);
  updateAuthWarmupCache(token, {
    hasCode: true,
    preparedAt: Date.now(),
  });

  // Persist state and code in background to avoid blocking flow transitions.
  void (async () => {
    try {
      const stateReady = await ensureSellerState(token);
      if (!stateReady) {
        console.error("ensureSellerState failed during signup", { token });
        return;
      }

      const alreadyHasCode = await sellerHasCode(token);
      if (alreadyHasCode) {
        updateAuthWarmupCache(token, {
          hasCode: true,
          preparedAt: Date.now(),
        });
        console.log("signup skipped: account already configured", {
          tokenSuffix: String(token || "").slice(-6),
        });
        return;
      }

      const updated = await setSellerCode(token, pin);
      if (!updated) {
        console.error("setSellerCode failed during signup", { token });
      } else {
        updateAuthWarmupCache(token, {
          hasCode: true,
          preparedAt: Date.now(),
        });
      }
    } catch (err) {
      console.error("async signup persistence failed", err);
    }
  })();

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

  // INIT / NAVIGATE: warm up seller state and next screen decision without blocking.
  if (action === "INIT" || action === "NAVIGATE") {
    const token = getFlowToken(parsed);
    if (token) {
      primeAuthWarmupAsync(token);
      void ensureSellerState(token);
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