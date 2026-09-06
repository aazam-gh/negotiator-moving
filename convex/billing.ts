import { StripeSubscriptions } from "@convex-dev/stripe";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { action, query } from "./_generated/server";

const stripeClient = new StripeSubscriptions(components.stripe, {});

export const createSubscriptionCheckout = action({
  args: { priceId: v.optional(v.string()) },
  returns: v.object({
    sessionId: v.string(),
    url: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { priceId: requestedPriceId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!identity.email) throw new Error("A verified email is required for billing");
    const priceId = requestedPriceId ?? process.env.STRIPE_PRICE_ID;
    if (!priceId) throw new Error("Billing is not configured with a subscription price yet.");
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

export const config = query({
  args: {},
  returns: v.object({ configured: v.boolean() }),
  handler: async () => ({ configured: Boolean(process.env.STRIPE_PRICE_ID) }),
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
