import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const missionStatus = v.union(
  v.literal("draft"),
  v.literal("collecting_requirements"),
  v.literal("ready_for_research"),
  v.literal("researching"),
  v.literal("reviewing_shortlist"),
  v.literal("awaiting_outreach_approval"),
  v.literal("contacting"),
  v.literal("waiting_for_responses"),
  v.literal("comparing"),
  v.literal("ready_to_choose"),
  v.literal("completed"),
  v.literal("paused"),
  v.literal("failed"),
);
export const missionProviderStatus = v.union(
  v.literal("discovered"),
  v.literal("researched"),
  v.literal("shortlisted"),
  v.literal("approved"),
  v.literal("contacted"),
  v.literal("replied"),
  v.literal("declined"),
  v.literal("failed"),
);
export const triState = v.union(
  v.literal("included"),
  v.literal("not_included"),
  v.literal("not_stated"),
  v.literal("needs_clarification"),
);
export const movingRequirements = v.object({
  origin: v.string(),
  destination: v.string(),
  requestedDate: v.string(),
  propertySize: v.string(),
  bedrooms: v.optional(v.number()),
  packingRequired: v.optional(v.boolean()),
  disassemblyRequired: v.optional(v.boolean()),
  reassemblyRequired: v.optional(v.boolean()),
  specialItems: v.optional(v.string()),
  elevatorAvailability: v.optional(v.string()),
  budget: v.optional(v.number()),
  notes: v.optional(v.string()),
});

export const mailboxStatus = v.union(
  v.literal("pending"),
  v.literal("ready"),
  v.literal("failed"),
);

export const negotiationRunStatus = v.union(
  v.literal("starting"),
  v.literal("awaiting_reply"),
  v.literal("evaluating"),
  v.literal("countering"),
  v.literal("ready_for_user"),
  v.literal("needs_review"),
  v.literal("exhausted"),
  v.literal("completed"),
  v.literal("failed"),
);

export default defineSchema({
  ...authTables,
  workspaces: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    kind: v.literal("personal"),
    status: v.union(v.literal("active"), v.literal("suspended")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerId", ["ownerId"]),
  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("member")),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_workspaceId_and_userId", ["workspaceId", "userId"]),
  mailboxes: defineTable({
    workspaceId: v.id("workspaces"),
    ownerId: v.id("users"),
    provider: v.literal("agentmail"),
    status: mailboxStatus,
    inboxId: v.optional(v.string()),
    address: v.optional(v.string()),
    provisioningKey: v.string(),
    provisioningWorkflowId: v.optional(v.string()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_ownerId", ["ownerId"])
    .index("by_inboxId", ["inboxId"])
    .index("by_provisioningKey", ["provisioningKey"]),
  missions: defineTable({
    ownerId: v.optional(v.id("users")),
    workspaceId: v.optional(v.id("workspaces")),
    createdBy: v.optional(v.id("users")),
    demoKey: v.optional(v.string()),
    isDemo: v.boolean(),
    title: v.string(),
    category: v.literal("moving"),
    rawRequest: v.string(),
    status: missionStatus,
    currency: v.string(),
    requirements: movingRequirements,
    targetQuoteCount: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"])
    .index("by_demoKey", ["demoKey"]),
  providers: defineTable({
    name: v.string(),
    canonicalDomain: v.string(),
    website: v.string(),
    contactEmail: v.optional(v.string()),
    location: v.optional(v.string()),
    serviceAreas: v.array(v.string()),
    categories: v.array(v.string()),
    summary: v.string(),
    isDemo: v.boolean(),
    createdAt: v.number(),
  }).index("by_canonicalDomain", ["canonicalDomain"]),
  missionProviders: defineTable({
    missionId: v.id("missions"),
    providerId: v.id("providers"),
    status: missionProviderStatus,
    fitScore: v.optional(v.number()),
    fitReasons: v.array(v.string()),
    concerns: v.array(v.string()),
    selectedForOutreach: v.boolean(),
    discoveredAt: v.number(),
    contactedAt: v.optional(v.number()),
    repliedAt: v.optional(v.number()),
  })
    .index("by_missionId", ["missionId"])
    .index("by_missionId_and_providerId", ["missionId", "providerId"]),
  researchSources: defineTable({
    missionId: v.id("missions"),
    providerId: v.optional(v.id("providers")),
    url: v.string(),
    title: v.string(),
    sourceType: v.union(
      v.literal("search"),
      v.literal("provider_site"),
      v.literal("demo_fixture"),
    ),
    summary: v.string(),
    retrievedAt: v.number(),
  })
    .index("by_missionId", ["missionId"])
    .index("by_providerId", ["providerId"]),
  outreachThreads: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    missionId: v.id("missions"),
    providerId: v.id("providers"),
    mailboxId: v.optional(v.id("mailboxes")),
    inboxId: v.string(),
    agentThreadId: v.optional(v.string()),
    outboundId: v.optional(v.string()),
    agentMailThreadId: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("replied"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
    subject: v.string(),
    lastMessageAt: v.number(),
  })
    .index("by_missionId", ["missionId"])
    .index("by_agentMailThreadId", ["agentMailThreadId"])
    .index("by_missionId_and_providerId", ["missionId", "providerId"]),
  messages: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    missionId: v.id("missions"),
    providerId: v.id("providers"),
    threadId: v.id("outreachThreads"),
    negotiationRunId: v.optional(v.id("negotiationRuns")),
    direction: v.union(v.literal("outbound"), v.literal("inbound")),
    subject: v.string(),
    bodyText: v.string(),
    externalMessageId: v.string(),
    classification: v.union(
      v.literal("quote"),
      v.literal("needs_more_information"),
      v.literal("decline"),
      v.literal("acknowledgement"),
      v.literal("out_of_office"),
      v.literal("unrelated"),
      v.literal("other"),
      v.literal("unknown"),
      v.literal("needs_review"),
    ),
    occurredAt: v.number(),
  })
    .index("by_threadId", ["threadId"])
    .index("by_externalMessageId", ["externalMessageId"]),
  quotes: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    missionId: v.id("missions"),
    providerId: v.id("providers"),
    sourceMessageId: v.id("messages"),
    round: v.optional(v.number()),
    currency: v.string(),
    subtotal: v.optional(v.number()),
    tax: v.optional(v.number()),
    total: v.optional(v.number()),
    availability: v.string(),
    packing: triState,
    disassembly: triState,
    reassembly: triState,
    insurance: triState,
    inclusions: v.array(v.string()),
    exclusions: v.array(v.string()),
    missingFields: v.array(v.string()),
    confidence: v.number(),
    rawExtraction: v.string(),
    manuallyEditedAt: v.optional(v.number()),
    manualEditNote: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_missionId", ["missionId"])
    .index("by_sourceMessageId", ["sourceMessageId"]),
  activityEvents: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    missionId: v.id("missions"),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    sourceUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_missionId_and_createdAt", ["missionId", "createdAt"]),
  agentRuns: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    missionId: v.id("missions"),
    type: v.union(
      v.literal("request_parse"),
      v.literal("provider_discovery"),
      v.literal("provider_qualification"),
      v.literal("outreach_compose"),
      v.literal("inbound_classification"),
      v.literal("quote_extraction"),
      v.literal("quote_comparison"),
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_missionId", ["missionId"]),
  approvals: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    missionId: v.id("missions"),
    ownerId: v.id("users"),
    type: v.union(
      v.literal("provider_outreach"),
      v.literal("negotiation_mandate"),
    ),
    providerIds: v.array(v.id("providers")),
    approvedAt: v.number(),
    idempotencyKey: v.string(),
  })
    .index("by_missionId", ["missionId"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_workspaceId_and_idempotencyKey", [
      "workspaceId",
      "idempotencyKey",
    ]),
  negotiationPolicies: defineTable({
    workspaceId: v.id("workspaces"),
    missionId: v.id("missions"),
    ownerId: v.id("users"),
    targetTotal: v.optional(v.number()),
    maxBudget: v.optional(v.number()),
    maxRounds: v.number(),
    maxMessagesPerProvider: v.number(),
    followupHours: v.number(),
    satisfactionThreshold: v.number(),
    status: v.union(v.literal("approved"), v.literal("revoked")),
    approvedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_missionId", ["missionId"]),
  negotiationRuns: defineTable({
    workspaceId: v.id("workspaces"),
    missionId: v.id("missions"),
    providerId: v.id("providers"),
    outreachThreadId: v.id("outreachThreads"),
    policyId: v.id("negotiationPolicies"),
    agentThreadId: v.string(),
    workflowId: v.optional(v.string()),
    status: negotiationRunStatus,
    round: v.number(),
    followupsSent: v.optional(v.number()),
    nextFollowupAt: v.optional(v.number()),
    forcedFailuresRemaining: v.number(),
    lastDecision: v.optional(v.string()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_missionId", ["missionId"])
    .index("by_outreachThreadId", ["outreachThreadId"])
    .index("by_workspaceId", ["workspaceId"]),
  webhookQuarantine: defineTable({
    inboxId: v.optional(v.string()),
    eventId: v.string(),
    reason: v.string(),
    missionLabel: v.optional(v.string()),
    providerLabel: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_eventId", ["eventId"]),
});
