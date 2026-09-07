import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { parseProviderReply } from "../lib/negotiator-rules";
import { saveMessage } from "@convex-dev/agent";
import { sendEvent, type WorkflowId } from "@convex-dev/workflow";
import { components } from "./_generated/api";
import { providerReplyEvent } from "./negotiation";

const outboundStatusByEvent = {
  "message.sent": "sent",
  "message.delivered": "delivered",
  "message.bounced": "bounced",
  "message.complained": "failed",
  "message.rejected": "failed",
} as const;

export const onEvent = internalMutation({
  args: { event: v.any() },
  returns: v.null(),
  handler: async (ctx, { event }) => {
    const status = outboundStatusByEvent[event?.event_type as keyof typeof outboundStatusByEvent];
    if (!status) return null;
    const thread = event?.thread;
    const inboxId = String(
      event?.message?.inbox_id ?? thread?.inbox_id ?? event?.inbox_id ?? "",
    );
    const mailbox = inboxId
      ? await ctx.db
          .query("mailboxes")
          .withIndex("by_inboxId", (q) => q.eq("inboxId", inboxId))
          .unique()
      : null;
    const labels = Array.isArray(thread?.labels) ? thread.labels : [];
    const workspaceLabel = labels.find(
      (label: unknown) =>
        typeof label === "string" && label.startsWith("workspace:"),
    );
    const missionLabel = labels.find(
      (label: unknown) =>
        typeof label === "string" && label.startsWith("mission:"),
    );
    const providerLabel = labels.find(
      (label: unknown) =>
        typeof label === "string" && label.startsWith("provider:"),
    );
    if (!mailbox || !workspaceLabel || !missionLabel || !providerLabel) return null;
    if (String(workspaceLabel).slice(10) !== String(mailbox.workspaceId)) return null;
    const missionId = String(missionLabel).slice(8) as Id<"missions">;
    const providerId = String(providerLabel).slice(9) as Id<"providers">;
    const localThread = await ctx.db
      .query("outreachThreads")
      .withIndex("by_missionId_and_providerId", (q) =>
        q.eq("missionId", missionId).eq("providerId", providerId),
      )
      .unique();
    if (!localThread) return null;
    if (
      localThread.workspaceId !== mailbox.workspaceId ||
      localThread.inboxId !== inboxId
    )
      return null;
    await ctx.db.patch(localThread._id, {
      status,
      agentMailThreadId: String(
        thread?.thread_id ?? event?.message?.thread_id ?? localThread.agentMailThreadId ?? "",
      ),
      lastMessageAt: Date.now(),
    });
    return null;
  },
});

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, { message, thread, eventId }) => {
    const inboxId = String(message?.inbox_id ?? thread?.inbox_id ?? "");
    const mailbox = inboxId
      ? await ctx.db
          .query("mailboxes")
          .withIndex("by_inboxId", (q) => q.eq("inboxId", inboxId))
          .unique()
      : null;
    const labels = Array.isArray(thread?.labels) ? thread.labels : [];
    const workspaceLabel = labels.find(
      (label: unknown) =>
        typeof label === "string" && label.startsWith("workspace:"),
    );
    const missionLabel = labels.find(
      (label: unknown) =>
        typeof label === "string" && label.startsWith("mission:"),
    );
    const providerLabel = labels.find(
      (label: unknown) =>
        typeof label === "string" && label.startsWith("provider:"),
    );
    if (!mailbox || !workspaceLabel || !missionLabel || !providerLabel) {
      await quarantine(ctx, {
        inboxId: inboxId || undefined,
        eventId,
        reason: "Inbound message could not be mapped to a private workspace mailbox.",
        missionLabel: missionLabel ? String(missionLabel) : undefined,
        providerLabel: providerLabel ? String(providerLabel) : undefined,
      });
      return null;
    }
    if (String(workspaceLabel).slice(10) !== String(mailbox.workspaceId)) {
      await quarantine(ctx, {
        inboxId,
        eventId,
        reason: "Workspace label does not match the receiving mailbox.",
        missionLabel: String(missionLabel),
        providerLabel: String(providerLabel),
      });
      return null;
    }
    const missionId = String(missionLabel).slice(8) as Id<"missions">;
    const providerId = String(providerLabel).slice(9) as Id<"providers">;
    const externalId = String(message?.message_id ?? eventId);
    if (
      await ctx.db
        .query("messages")
        .withIndex("by_externalMessageId", (q) =>
          q.eq("externalMessageId", externalId),
        )
        .unique()
    )
      return null;
    const localThread = await ctx.db
      .query("outreachThreads")
      .withIndex("by_missionId_and_providerId", (q) =>
        q.eq("missionId", missionId).eq("providerId", providerId),
      )
      .unique();
    const mission = await ctx.db.get("missions", missionId);
    if (
      !localThread ||
      !mission ||
      mission.workspaceId !== mailbox.workspaceId ||
      localThread.workspaceId !== mailbox.workspaceId ||
      localThread.mailboxId !== mailbox._id ||
      localThread.inboxId !== inboxId
    ) {
      await quarantine(ctx, {
        inboxId,
        eventId,
        reason: "Inbound labels failed the mission, thread, and mailbox tenancy check.",
        missionLabel: String(missionLabel),
        providerLabel: String(providerLabel),
      });
      return null;
    }
    const run = await ctx.db
      .query("negotiationRuns")
      .withIndex("by_outreachThreadId", (q) =>
        q.eq("outreachThreadId", localThread._id),
      )
      .unique();
    if (!run || run.workspaceId !== mailbox.workspaceId) {
      await quarantine(ctx, {
        inboxId,
        eventId,
        reason: "No active tenant-scoped negotiation exists for this thread.",
        missionLabel: String(missionLabel),
        providerLabel: String(providerLabel),
      });
      return null;
    }
    const parsed = parseProviderReply(
      String(message?.subject ?? "Reply"),
      String(message?.text ?? message?.extracted_text ?? ""),
    );
    const messageId = await ctx.db.insert("messages", {
      workspaceId: mailbox.workspaceId,
      missionId,
      providerId,
      threadId: localThread._id,
      negotiationRunId: run._id,
      direction: "inbound",
      subject: String(message?.subject ?? "Reply"),
      bodyText: String(message?.text ?? message?.extracted_text ?? ""),
      externalMessageId: externalId,
      classification: parsed.classification,
      occurredAt: Date.now(),
    });
    await saveMessage(ctx, components.agent, {
      threadId: run.agentThreadId,
      userId: String(mailbox.workspaceId),
      message: {
        role: "user",
        content: String(message?.text ?? message?.extracted_text ?? ""),
      },
    });
    await ctx.db.patch("outreachThreads", localThread._id, {
      status: "replied",
      agentMailThreadId: String(message?.thread_id ?? ""),
      lastMessageAt: Date.now(),
    });
    await ctx.db.patch("missions", missionId, {
      status: "comparing",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("activityEvents", {
      workspaceId: mailbox.workspaceId,
      missionId,
      type: "provider_replied",
      title: "Provider replied",
      description: "A provider reply arrived in the mission inbox.",
      createdAt: Date.now(),
    });
    if (parsed.classification === "quote") {
      await ctx.db.insert("quotes", {
        workspaceId: mailbox.workspaceId,
        missionId,
        providerId,
        sourceMessageId: messageId,
        round: run.round + 1,
        currency: parsed.currency,
        subtotal: parsed.subtotal,
        tax: parsed.tax,
        total: parsed.total,
        availability: parsed.availability,
        packing: parsed.packing,
        disassembly: parsed.disassembly,
        reassembly: parsed.reassembly,
        insurance: parsed.insurance,
        inclusions: parsed.inclusions,
        exclusions: parsed.exclusions,
        missingFields: parsed.missingFields,
        confidence: parsed.confidence,
        rawExtraction: JSON.stringify(parsed),
        createdAt: Date.now(),
      });
      await ctx.db.insert("activityEvents", {
        workspaceId: mailbox.workspaceId,
        missionId,
        type: "quote_extracted",
        title: "Quote extracted",
        description:
          "Explicit price and service details were added to the comparison.",
        createdAt: Date.now(),
      });
    } else if (parsed.classification === "needs_review") {
      await ctx.db.insert("activityEvents", {
        workspaceId: mailbox.workspaceId,
        missionId,
        type: "message_needs_review",
        title: "Reply needs review",
        description:
          "The reply was preserved because the deterministic rules were not confident enough to classify it.",
        createdAt: Date.now(),
      });
    }
    if (
      run.workflowId &&
      ["starting", "awaiting_reply", "evaluating", "countering"].includes(
        run.status,
      )
    ) {
      await sendEvent(ctx, components.workflow, {
        ...providerReplyEvent,
        workflowId: run.workflowId as WorkflowId,
        value: { messageId },
      });
    }
    return null;
  },
});

async function quarantine(
  ctx: MutationCtx,
  args: {
    inboxId?: string;
    eventId: string;
    reason: string;
    missionLabel?: string;
    providerLabel?: string;
  },
) {
  const existing = await ctx.db
    .query("webhookQuarantine")
    .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
    .unique();
  if (existing) return;
  await ctx.db.insert("webhookQuarantine", {
    ...args,
    createdAt: Date.now(),
  });
}
