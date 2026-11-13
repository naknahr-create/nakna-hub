import { authenticateHubRequest } from "../lib/hub-auth";
import { canonicalHubRedirect } from "../lib/hub-canonical";
import { handleLineAuthRequest } from "../lib/line-auth";
import { runLineDigests } from "../lib/line-digest";
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const canonicalResponse = canonicalHubRedirect(request, env.APP_ORIGIN);
    if (canonicalResponse) return canonicalResponse;
    const authResponse = await handleLineAuthRequest(request, env);
    if (authResponse) return authResponse;
    request = await authenticateHubRequest(request, env);
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
  async scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    // A platform gate plus each account's explicit opt-in are both required.
    if (env.LINE_DIGEST_ENABLED !== "true") return;
    ctx.waitUntil(runLineDigests(env, controller.scheduledTime).catch(() => {
      console.error("LINE daily report job failed; inspect the delivery queue before retrying.");
    }));
  },
};

export default worker;

