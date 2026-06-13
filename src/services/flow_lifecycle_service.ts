import { sendMenu } from "@/services/menu_service";

export type FlowLifecycleSource = "open-proxy" | "success";

/**
 * Dispatches a lifecycle-driven menu send without blocking flow responses.
 * It intentionally runs fire-and-forget because flow UX should not wait on menu delivery.
 */
export function dispatchFlowLifecycleMenu(params: {
  flowTokenOrPhone: string | null | undefined;
  source: FlowLifecycleSource;
  flow: string;
}): void {
  const input = String(params.flowTokenOrPhone || "").trim();
  if (!input) {
    console.warn("[flow-lifecycle] skipped menu dispatch: missing token/phone", {
      source: params.source,
      flow: params.flow,
    });
    return;
  }

  void sendMenu(input)
    .then(() => {
      console.info("[flow-lifecycle] menu dispatch completed", {
        source: params.source,
        flow: params.flow,
      });
    })
    .catch((error) => {
      console.error("[flow-lifecycle] menu dispatch failed", {
        source: params.source,
        flow: params.flow,
        error,
      });
    });
}
