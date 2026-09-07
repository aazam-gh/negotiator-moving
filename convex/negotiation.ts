import { saveMessage } from "@convex-dev/agent";
import {
  defineEvent,
  type WorkflowId,
  vResultValidator,
  vWorkflowId,
} from "@convex-dev/workflow";
import { v } from "convex/values";
import { AgentMail } from "@agentmail/convex";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { requireMission } from "./model";
import { workflows } from "./workflows";

const agentmail = new AgentMail(components.agentmail);

export const providerReplyEvent = defineEvent({
  name: "providerReply",
  validator: v.object({ messageId: v.id("messages") }),
});

const decisionValidator = v.object({
  outcome: v.union(
    v.literal("countered"),
    v.literal("ready_for_user"),
    v.literal("needs_review"),
    v.literal("exhausted"),
  ),
});

export const providerNegotiationWorkflow = workflows
  .define({
    args: { runId: v.id("negotiationRuns") },
    returns: decisionValidator,
  })
  .handler(async (step, { runId }): Promise<{ outcome: "countered" | "ready_for_user" | "needs_review" | "exhausted" }> => {
    const limit = await step.runMutation(
      internal.negotiation.markAwaitingReply,
      { runId },
      { inline: true, name: "Begin negotiation" },
    );
    let lastOutcome: "countered" | "ready_for_user" | "needs_review" | "exhausted" =
      "exhausted";
    for (let round = 1; round <= limit; round++) {
      const { messageId } = await step.awaitEvent(providerReplyEvent);
      const decision = await step.runAction(
        internal.negotiation.evaluateReplyAction,
        { runId, messageId },
        {
          retry: { maxAttempts: 3, initialBackoffMs: 250, base: 2 },
          name: `Evaluate provider reply ${round}`,
        },
      );
      lastOutcome = decision.outcome;
      if (decision.outcome !== "countered") return decision;
    }
    await step.runMutation(
      internal.negotiation.markExhausted,
      { runId },
      { inline: true, name: "Stop at mandate limit" },
    );
    return { outcome: lastOutcome === "countered" ? "exhausted" : lastOutcome };
  });

export const markAwaitingReply = internalMutation({
  args: { runId: v.id("negotiationRuns") },
  returns: v.number(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("negotiationRuns", runId);
    if (!run) throw new Error("Negotiation run not found");
    const policy = await ctx.db.get("negotiationPolicies", run.policyId);
    if (!policy || policy.status !== "approved")
      throw new Error("Negotiation mandate is not active");
    await ctx.db.patch("negotiationRuns", runId, {
      status: "awaiting_reply",
      updatedAt: Date.now(),
    });
    return policy.maxRounds;
  },
});

export const evaluateReplyAction = internalAction({
  args: {
    runId: v.id("negotiationRuns"),
    messageId: v.id("messages"),
  },
  returns: decisionValidator,
  handler: async (ctx, args): Promise<{
    outcome: "countered" | "ready_for_user" | "needs_review" | "exhausted";
  }> => {
    const shouldFail = await ctx.runMutation(
      internal.negotiation.consumeForcedFailure,
      { runId: args.runId },
    );
    if (shouldFail)
      throw new Error("Controlled transient failure for workflow recovery proof");
    return await ctx.runMutation(internal.negotiation.evaluateAndRespond, args);
  },
});

export const consumeForcedFailure = internalMutation({
  args: { runId: v.id("negotiationRuns") },
  returns: v.boolean(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("negotiationRuns", runId);
    if (!run || run.forcedFailuresRemaining <= 0) return false;
    await ctx.db.patch("negotiationRuns", runId, {
      forcedFailuresRemaining: run.forcedFailuresRemaining - 1,
      lastDecision: "Transient failure injected; workflow retry expected.",
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const evaluateAndRespond = internalMutation({
  args: {
    runId: v.id("negotiationRuns"),
    messageId: v.id("messages"),
  },
  returns: decisionValidator,
  handler: async (ctx, { runId, messageId }) => {
    const run = await ctx.db.get("negotiationRuns", runId);
    const message = await ctx.db.get("messages", messageId);
    if (!run || !message || message.negotiationRunId !== runId)
      throw new Error("Reply does not belong to this negotiation");
    const policy = await ctx.db.get("negotiationPolicies", run.policyId);
    const thread = await ctx.db.get("outreachThreads", run.outreachThreadId);
    if (!policy || !thread || policy.workspaceId !== run.workspaceId)
      throw new Error("Negotiation tenancy mismatch");
    const now = Date.now();
    await ctx.db.patch("negotiationRuns", runId, {
      status: "evaluating",
      updatedAt: now,
    });
    if (message.classification === "needs_review" || message.classification === "unknown") {
      await setRunDecision(ctx, runId, "needs_review", run.round, "Reply needs user review.");
      return { outcome: "needs_review" as const };
    }
    if (message.classification === "decline") {
      await setRunDecision(ctx, runId, "exhausted", run.round, "Provider declined.");
      return { outcome: "exhausted" as const };
    }
    const quote = await ctx.db
      .query("quotes")
      .withIndex("by_sourceMessageId", (q) => q.eq("sourceMessageId", messageId))
      .unique();
    const requiredMissing = quote?.missingFields.filter((field) =>
      ["total", "availability", "disassembly", "reassembly"].includes(field),
    ) ?? ["quote"];
    const withinBudget =
      quote?.total !== undefined &&
      (policy.maxBudget === undefined || quote.total <= policy.maxBudget);
    const available = quote
      ? !/not available|unavailable/i.test(quote.availability)
      : false;
    if (quote && withinBudget && available && requiredMissing.length === 0) {
      await setRunDecision(
        ctx,
        runId,
        "ready_for_user",
        run.round + 1,
        `Quote ${quote.currency} ${quote.total} satisfies the approved mandate.`,
      );
      await ctx.db.patch("missions", run.missionId, {
        status: "ready_to_choose",
        updatedAt: now,
      });
      await ctx.db.insert("activityEvents", {
        workspaceId: run.workspaceId,
        missionId: run.missionId,
        type: "satisfactory_quote",
        title: "Satisfactory quote ready",
        description: "The quote satisfies the approved mandate and is waiting for your decision.",
        createdAt: now,
      });
      return { outcome: "ready_for_user" as const };
    }
    const nextRound = run.round + 1;
    if (nextRound >= policy.maxRounds) {
      await setRunDecision(
        ctx,
        runId,
        "exhausted",
        nextRound,
        "Mandate round limit reached without a satisfactory quote.",
      );
      return { outcome: "exhausted" as const };
    }
    const target = policy.targetTotal ?? policy.maxBudget;
    const request = composeCounterRequest({
      currency: quote?.currency ?? "QAR",
      target,
      missingFields: quote?.missingFields ?? ["total", "availability"],
    });
    const outboundId = await agentmail.replyToMessage(
      ctx,
      thread.inboxId,
      message.externalMessageId,
      { text: request },
    );
    await ctx.db.insert("messages", {
      workspaceId: run.workspaceId,
      missionId: run.missionId,
      providerId: run.providerId,
      threadId: thread._id,
      negotiationRunId: runId,
      direction: "outbound",
      subject: `Re: ${thread.subject}`,
      bodyText: request,
      externalMessageId: outboundId,
      classification: "other",
      occurredAt: now,
    });
    await saveMessage(ctx, components.agent, {
      threadId: run.agentThreadId,
      userId: String(run.workspaceId),
      agentName: "Negotiator",
      message: { role: "assistant", content: request },
    });
    await setRunDecision(
      ctx,
      runId,
      "awaiting_reply",
      nextRound,
      target
        ? `Countered toward ${quote?.currency ?? "QAR"} ${target}.`
        : "Requested the missing quote details.",
    );
    await ctx.db.insert("activityEvents", {
      workspaceId: run.workspaceId,
      missionId: run.missionId,
      type: "negotiation_countered",
      title: "Negotiator replied",
      description: "A policy-bounded clarification or counteroffer was sent automatically.",
      createdAt: now,
    });
    return { outcome: "countered" as const };
  },
});

export const markExhausted = internalMutation({
  args: { runId: v.id("negotiationRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("negotiationRuns", runId);
    if (!run || ["ready_for_user", "completed"].includes(run.status)) return null;
    await setRunDecision(
      ctx,
      runId,
      "exhausted",
      run.round,
      "Negotiation stopped at the approved mandate limit.",
    );
    return null;
  },
});

export const onNegotiationComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ runId: v.id("negotiationRuns") }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.result.kind !== "failed") return null;
    const run = await ctx.db.get("negotiationRuns", args.context.runId);
    if (!run || run.status === "completed") return null;
    await ctx.db.patch("negotiationRuns", run._id, {
      status: "failed",
      lastError: args.result.error.slice(0, 500),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const injectOneTransientFailure = internalMutation({
  args: { runId: v.id("negotiationRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("negotiationRuns", runId);
    if (!run) throw new Error("Negotiation run not found");
    await ctx.db.patch("negotiationRuns", runId, {
      forcedFailuresRemaining: 1,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const acceptQuote = mutation({
  args: { quoteId: v.id("quotes") },
  returns: v.null(),
  handler: async (ctx, { quoteId }) => {
    const quote = await ctx.db.get("quotes", quoteId);
    if (!quote) throw new Error("Quote not found");
    const mission = await requireMission(ctx, quote.missionId);
    if (!mission.workspaceId || quote.workspaceId !== mission.workspaceId)
      throw new Error("Quote not found");
    const runs = await ctx.db
      .query("negotiationRuns")
      .withIndex("by_missionId", (q) => q.eq("missionId", mission._id))
      .take(50);
    const run = runs.find((candidate) => candidate.providerId === quote.providerId);
    if (!run || run.status !== "ready_for_user")
      throw new Error("This quote is not ready for acceptance");
    const now = Date.now();
    await ctx.db.patch("negotiationRuns", run._id, {
      status: "completed",
      lastDecision: "User selected the satisfactory quote. No booking or payment was made.",
      updatedAt: now,
      completedAt: now,
    });
    await ctx.db.patch("missions", mission._id, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activityEvents", {
      workspaceId: mission.workspaceId,
      missionId: mission._id,
      type: "quote_selected",
      title: "Quote selected",
      description: "You selected a satisfactory quote. Negotiator did not book or pay for it.",
      createdAt: now,
    });
    return null;
  },
});

export function asWorkflowId(value: string) {
  return value as WorkflowId;
}

async function setRunDecision(
  ctx: MutationCtx,
  runId: Id<"negotiationRuns">,
  status: "awaiting_reply" | "ready_for_user" | "needs_review" | "exhausted",
  round: number,
  lastDecision: string,
) {
  await ctx.db.patch("negotiationRuns", runId, {
    status,
    round,
    lastDecision,
    lastError: undefined,
    updatedAt: Date.now(),
  });
}

function composeCounterRequest(args: {
  currency: string;
  target?: number;
  missingFields: string[];
}) {
  const price = args.target
    ? `Could you bring the all-inclusive total to ${args.currency} ${args.target}?`
    : "Could you confirm your best all-inclusive total?";
  const details = args.missingFields.length
    ? ` Please also confirm: ${args.missingFields.join(", ")}.`
    : " Please confirm the same scope and availability remain included.";
  return `Thank you for the quote. ${price}${details} No booking is being made at this stage.`;
}
