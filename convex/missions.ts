import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { missionStatus, movingRequirements } from "./schema";
import { assertTransition, requireMission, requireUser } from "./model";

export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("missions"),
      title: v.string(),
      status: missionStatus,
      isDemo: v.boolean(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return [];
    const rows = await ctx.db
      .query("missions")
      .withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(25);
    return rows.map(({ _id, title, status, isDemo, updatedAt }) => ({
      _id,
      title,
      status,
      isDemo,
      updatedAt,
    }));
  },
});

export const create = mutation({
  args: {
    rawRequest: v.string(),
    title: v.string(),
    requirements: movingRequirements,
  },
  returns: v.id("missions"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const now = Date.now();
    const missionId = await ctx.db.insert("missions", {
      ownerId,
      isDemo: false,
      title: args.title,
      category: "moving",
      rawRequest: args.rawRequest,
      status: "ready_for_research",
      currency: "QAR",
      requirements: args.requirements,
      targetQuoteCount: 3,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activityEvents", {
      missionId,
      type: "mission_created",
      title: "Mission created",
      description: "Moving requirements were confirmed.",
      createdAt: now,
    });
    return missionId;
  },
});

export const transition = mutation({
  args: { missionId: v.id("missions"), status: missionStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    const mission = await requireMission(ctx, args.missionId);
    assertTransition(mission.status, args.status);
    await ctx.db.patch("missions", args.missionId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const selectProvider = mutation({
  args: {
    missionId: v.id("missions"),
    providerId: v.id("providers"),
    selected: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireMission(ctx, args.missionId);
    const row = await ctx.db
      .query("missionProviders")
      .withIndex("by_missionId_and_providerId", (q) =>
        q.eq("missionId", args.missionId).eq("providerId", args.providerId),
      )
      .unique();
    if (!row) throw new Error("Provider is not part of this mission");
    await ctx.db.patch("missionProviders", row._id, {
      selectedForOutreach: args.selected,
    });
    return null;
  },
});

export const dashboard = query({
  args: { missionId: v.id("missions") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const mission = await requireMission(ctx, args.missionId);
    const links = await ctx.db
      .query("missionProviders")
      .withIndex("by_missionId", (q) => q.eq("missionId", args.missionId))
      .take(50);
    const providers = await Promise.all(
      links.map(async (link) => ({
        link,
        provider: await ctx.db.get("providers", link.providerId),
        sources: await ctx.db
          .query("researchSources")
          .withIndex("by_providerId", (q) =>
            q.eq("providerId", link.providerId),
          )
          .take(8),
      })),
    );
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_missionId", (q) => q.eq("missionId", args.missionId))
      .take(30);
    const quoteRows = await Promise.all(
      quotes.map(async (quote) => ({
        quote,
        provider: await ctx.db.get("providers", quote.providerId),
        message: await ctx.db.get("messages", quote.sourceMessageId),
      })),
    );
    const events = await ctx.db
      .query("activityEvents")
      .withIndex("by_missionId_and_createdAt", (q) =>
        q.eq("missionId", args.missionId),
      )
      .order("desc")
      .take(50);
    return { mission, providers, quotes: quoteRows, events };
  },
});

export const integrations = query({
  args: {},
  returns: v.object({
    firecrawl: v.boolean(),
    agentmail: v.boolean(),
  }),
  handler: async () => ({
    firecrawl: Boolean(
      process.env.FIRECRAWL_API_KEY &&
        process.env.FIRECRAWL_API_KEY !== "not-configured",
    ),
    agentmail: Boolean(
      process.env.AGENTMAIL_API_KEY &&
        process.env.AGENTMAIL_API_KEY !== "not-configured",
    ),
  }),
});
