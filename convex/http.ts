import { AgentMail } from "@agentmail/convex";
import { registerRoutes } from "@convex-dev/stripe";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);
registerRoutes(http, components.stripe, { webhookPath: "/stripe/webhook" });
const agentmail = new AgentMail(components.agentmail, {
  onEvent: internal.inbound.onEvent,
  onMessageReceived: internal.inbound.onMessageReceived,
});

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction((ctx, request) =>
    agentmail.handleWebhook(ctx as never, request),
  ),
});

registerStaticRoutes(http, components.staticHosting);
export default http;
