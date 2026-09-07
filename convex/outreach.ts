import { AgentMail } from "@agentmail/convex";
import { createThread, saveMessage } from "@convex-dev/agent";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireMission, requireRegisteredUser } from "./model";
import { formatMovingRfq } from "../lib/negotiator-rules";
import { normalizeNegotiationPolicy } from "../lib/negotiation-policy";
import { workflows } from "./workflows";

const agentmail = new AgentMail(components.agentmail);

export const approveAndSend = mutation({
  args: {
    missionId: v.id("missions"),
    providerIds: v.array(v.id("providers")),
    idempotencyKey: v.string(),
    targetTotal: v.optional(v.number()),
    maxBudget: v.optional(v.number()),
    maxRounds: v.optional(v.number()),
    maxMessagesPerProvider: v.optional(v.number()),
    followupHours: v.optional(v.number()),
    satisfactionThreshold: v.optional(v.number()),
  },
  returns: v.object({ sent: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireRegisteredUser(ctx);
    const mission = await requireMission(ctx, args.missionId);
    if (!mission.workspaceId) throw new Error("Mission workspace is missing");
    const policy = normalizeNegotiationPolicy(args, mission.requirements.budget);
    if (!args.idempotencyKey.trim() || args.idempotencyKey.length > 128)
      throw new Error("A valid idempotency key is required");
    const prior = await ctx.db
      .query("approvals")
      .withIndex("by_workspaceId_and_idempotencyKey", (q) =>
        q
          .eq("workspaceId", mission.workspaceId)
          .eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (prior) return { sent: 0 };
    if (!args.providerIds.length)
      throw new Error("Select at least one provider");
    if (args.providerIds.length > 10)
      throw new Error("Select no more than 10 providers at once");
    const providerIds = [...new Set(args.providerIds)];
    if (providerIds.length !== args.providerIds.length)
      throw new Error("A provider can only be selected once");
    const mailbox = await ctx.db
      .query("mailboxes")
      .withIndex("by_workspaceId", (q) =>
        q.eq("workspaceId", mission.workspaceId!),
      )
      .unique();
    if (!mailbox || mailbox.status !== "ready" || !mailbox.inboxId)
      throw new Error("Your private negotiation inbox is still being prepared");
    const inboxId = mailbox.inboxId;
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
      workspaceId: mission.workspaceId,
      missionId: args.missionId,
      ownerId: user._id,
      type: "negotiation_mandate",
      providerIds,
      approvedAt: Date.now(),
      idempotencyKey: args.idempotencyKey,
    });
    const existingPolicy = await ctx.db
      .query("negotiationPolicies")
      .withIndex("by_missionId", (q) => q.eq("missionId", mission._id))
      .unique();
    const policyId =
      existingPolicy?._id ??
      (await ctx.db.insert("negotiationPolicies", {
        workspaceId: mission.workspaceId,
        missionId: mission._id,
        ownerId: user._id,
        ...policy,
        status: "approved",
        approvedAt: Date.now(),
        updatedAt: Date.now(),
      }));
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
        labels: [
          `workspace:${mission.workspaceId}`,
          `mission:${args.missionId}`,
          `provider:${provider._id}`,
        ],
      });
      const agentThreadId = await createThread(ctx, components.agent, {
        userId: String(mission.workspaceId),
        title: `${mission.title} · ${provider.name}`,
        summary: "Durable provider negotiation history",
      });
      const threadId = await ctx.db.insert("outreachThreads", {
        workspaceId: mission.workspaceId,
        missionId: args.missionId,
        providerId: provider._id,
        mailboxId: mailbox._id,
        inboxId,
        agentThreadId,
        outboundId,
        status: "queued",
        subject,
        lastMessageAt: Date.now(),
      });
      const runId = await ctx.db.insert("negotiationRuns", {
        workspaceId: mission.workspaceId,
        missionId: mission._id,
        providerId: provider._id,
        outreachThreadId: threadId,
        policyId,
        agentThreadId,
        status: "starting",
        round: 0,
        followupsSent: 0,
        forcedFailuresRemaining: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        workspaceId: mission.workspaceId,
        missionId: args.missionId,
        providerId: provider._id,
        threadId,
        negotiationRunId: runId,
        direction: "outbound",
        subject,
        bodyText: text,
        externalMessageId: outboundId,
        classification: "other",
        occurredAt: Date.now(),
      });
      await saveMessage(ctx, components.agent, {
        threadId: agentThreadId,
        userId: String(mission.workspaceId),
        agentName: "Negotiator",
        message: { role: "assistant", content: text },
      });
      const workflowId = await workflows.start(
        ctx,
        internal.negotiation.providerNegotiationWorkflow,
        { runId },
        {
          onComplete: internal.negotiation.onNegotiationComplete,
          context: { runId },
          startAsync: true,
        },
      );
      await ctx.db.patch("negotiationRuns", runId, {
        workflowId: String(workflowId),
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
      workspaceId: mission.workspaceId,
      missionId: args.missionId,
      type: "outreach_sent",
      title: "Quote requests sent",
      description: `${sent} approved providers were contacted.`,
      createdAt: Date.now(),
    });
    return { sent };
  },
});
