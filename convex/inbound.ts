import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { parseProviderReply } from "../lib/negotiator-rules";

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
    const labels = Array.isArray(thread?.labels) ? thread.labels : [];
    const missionLabel = labels.find(
      (label: unknown) =>
        typeof label === "string" && label.startsWith("mission:"),
    );
    const providerLabel = labels.find(
      (label: unknown) =>
        typeof label === "string" && label.startsWith("provider:"),
    );
    if (!missionLabel || !providerLabel) return null;
    const missionId = String(missionLabel).slice(8) as Id<"missions">;
    const providerId = String(providerLabel).slice(9) as Id<"providers">;
    const localThread = await ctx.db
      .query("outreachThreads")
      .withIndex("by_missionId_and_providerId", (q) =>
        q.eq("missionId", missionId).eq("providerId", providerId),
      )
      .unique();
    if (!localThread) return null;
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
    const labels = Array.isArray(thread?.labels) ? thread.labels : [];
    const missionLabel = labels.find(
      (label: unknown) =>
        typeof label === "string" && label.startsWith("mission:"),
    );
    const providerLabel = labels.find(
      (label: unknown) =>
        typeof label === "string" && label.startsWith("provider:"),
    );
    if (!missionLabel || !providerLabel) return null;
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
    if (!localThread) return null;
    const parsed = parseProviderReply(
      String(message?.subject ?? "Reply"),
      String(message?.text ?? message?.extracted_text ?? ""),
    );
    const messageId = await ctx.db.insert("messages", {
      missionId,
      providerId,
      threadId: localThread._id,
      direction: "inbound",
      subject: String(message?.subject ?? "Reply"),
      bodyText: String(message?.text ?? message?.extracted_text ?? ""),
      externalMessageId: externalId,
      classification: parsed.classification,
      occurredAt: Date.now(),
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
      missionId,
      type: "provider_replied",
      title: "Provider replied",
      description: "A provider reply arrived in the mission inbox.",
      createdAt: Date.now(),
    });
    if (parsed.classification === "quote") {
      await ctx.db.insert("quotes", {
        missionId,
        providerId,
        sourceMessageId: messageId,
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
        missionId,
        type: "quote_extracted",
        title: "Quote extracted",
        description:
          "Explicit price and service details were added to the comparison.",
        createdAt: Date.now(),
      });
    } else if (parsed.classification === "needs_review") {
      await ctx.db.insert("activityEvents", {
        missionId,
        type: "message_needs_review",
        title: "Reply needs review",
        description:
          "The reply was preserved because the deterministic rules were not confident enough to classify it.",
        createdAt: Date.now(),
      });
    }
    return null;
  },
});
