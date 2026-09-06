import { AgentMail } from "@agentmail/convex";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireMission, requireUser } from "./model";
import { formatMovingRfq } from "../lib/negotiator-rules";

const agentmail = new AgentMail(components.agentmail);

export const approveAndSend = mutation({
  args: {
    missionId: v.id("missions"),
    providerIds: v.array(v.id("providers")),
    idempotencyKey: v.string(),
  },
  returns: v.object({ sent: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const mission = await requireMission(ctx, args.missionId);
    if (mission.isDemo) return { sent: 0 };
    if (process.env.BILLING_REQUIRED === "true") {
      const identity = await ctx.auth.getUserIdentity();
      const subscriptions = identity
        ? await ctx.runQuery(
            components.stripe.public.listSubscriptionsByUserId,
            { userId: identity.subject },
          )
        : [];
      if (
        !subscriptions.some(
          (subscription) =>
            subscription.status === "active" ||
            subscription.status === "trialing",
        )
      )
        throw new Error("An active Negotiator subscription is required for outreach.");
    }
    const prior = await ctx.db
      .query("approvals")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (prior) return { sent: 0 };
    if (!args.providerIds.length)
      throw new Error("Select at least one provider");
    const providerIds = [...new Set(args.providerIds)];
    if (providerIds.length !== args.providerIds.length)
      throw new Error("A provider can only be selected once");
    const inboxId = process.env.AGENTMAIL_INBOX_ID;
    if (
      !process.env.AGENTMAIL_API_KEY ||
      process.env.AGENTMAIL_API_KEY === "not-configured" ||
      !inboxId
    )
      throw new Error(
        "AgentMail is not configured. Set AGENTMAIL_API_KEY and AGENTMAIL_INBOX_ID in Convex.",
      );
    const providers = await Promise.all(
      providerIds.map((id) => ctx.db.get("providers", id)),
    );
    const missionLinks = await Promise.all(
      providerIds.map((providerId) =>
        ctx.db
          .query("missionProviders")
          .withIndex("by_missionId_and_providerId", (q) =>
            q.eq("missionId", args.missionId).eq("providerId", providerId),
          )
          .unique(),
      ),
    );
    if (missionLinks.some((link) => !link))
      throw new Error("Every selected provider must belong to this mission");
    if (
      missionLinks.some(
        (link) =>
          !link ||
          !["shortlisted", "researched", "contacted", "replied"].includes(
            link.status,
          ),
      )
    )
      throw new Error("Every selected provider must still be eligible for outreach");
    if (providers.some((provider) => !provider?.contactEmail))
      throw new Error(
        "Every selected provider needs a verified contact email before outreach.",
      );
    await ctx.db.insert("approvals", {
      missionId: args.missionId,
      ownerId,
      type: "provider_outreach",
      providerIds,
      approvedAt: Date.now(),
      idempotencyKey: args.idempotencyKey,
    });
    let sent = 0;
    for (const [index, provider] of providers.entries()) {
      if (!provider?.contactEmail) continue;
      const existingThread = await ctx.db
        .query("outreachThreads")
        .withIndex("by_missionId_and_providerId", (q) =>
          q.eq("missionId", args.missionId).eq("providerId", provider._id),
        )
        .unique();
      if (existingThread) continue;
      const subject = `Quote request: ${mission.title}`;
      const text = formatMovingRfq(mission.requirements);
      const outboundId = await agentmail.sendMessage(ctx, inboxId, {
        to: provider.contactEmail,
        subject,
        text,
        labels: [`mission:${args.missionId}`, `provider:${provider._id}`],
      });
      const threadId = await ctx.db.insert("outreachThreads", {
        missionId: args.missionId,
        providerId: provider._id,
        inboxId,
        outboundId,
        status: "queued",
        subject,
        lastMessageAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        missionId: args.missionId,
        providerId: provider._id,
        threadId,
        direction: "outbound",
        subject,
        bodyText: text,
        externalMessageId: outboundId,
        classification: "other",
        occurredAt: Date.now(),
      });
      const link = missionLinks[index];
      if (link)
        await ctx.db.patch("missionProviders", link._id, {
          status: "contacted",
          selectedForOutreach: true,
          contactedAt: Date.now(),
        });
      sent++;
    }
    await ctx.db.patch("missions", args.missionId, {
      status: "waiting_for_responses",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("activityEvents", {
      missionId: args.missionId,
      type: "outreach_sent",
      title: "Quote requests sent",
      description: `${sent} approved providers were contacted.`,
      createdAt: Date.now(),
    });
    return { sent };
  },
});
