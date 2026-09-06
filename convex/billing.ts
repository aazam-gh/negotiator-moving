import { StripeSubscriptions } from "@convex-dev/stripe";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { action, query } from "./_generated/server";

const stripeClient = new StripeSubscriptions(components.stripe, {});

export const createSubscriptionCheckout = action({
  args: { priceId: v.string() },
  returns: v.object({
    sessionId: v.string(),
    url: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { priceId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!identity.email) throw new Error("A verified email is required for billing");
    return await stripeClient.createCheckoutSession(ctx, {
      priceId,
      customerId: (
        await stripeClient.getOrCreateCustomer(ctx, {
          userId: identity.subject,
          email: identity.email,
          name: identity.name,
        })
      ).customerId,
      mode: "subscription",
      successUrl: `${process.env.SITE_URL ?? "https://clean-greyhound-195.convex.site"}/?billing=success`,
      cancelUrl: `${process.env.SITE_URL ?? "https://clean-greyhound-195.convex.site"}/?billing=canceled`,
      subscriptionMetadata: { userId: identity.subject },
    });
  },
});

export const isSubscribed = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const subscriptions = await ctx.runQuery(
      components.stripe.public.listSubscriptionsByUserId,
      { userId: identity.subject },
    );
    return subscriptions.some(
      (subscription) =>
        subscription.status === "active" || subscription.status === "trialing",
    );
  },
});
