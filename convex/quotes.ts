import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { triState } from "./schema";
import { requireMission } from "./model";

export const correct = mutation({
  args: {
    quoteId: v.id("quotes"),
    currency: v.string(),
    total: v.optional(v.number()),
    availability: v.string(),
    packing: triState,
    disassembly: triState,
    reassembly: triState,
    insurance: triState,
    inclusions: v.array(v.string()),
    exclusions: v.array(v.string()),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const quote = await ctx.db.get("quotes", args.quoteId);
    if (!quote) throw new Error("Quote not found");
    const mission = await requireMission(ctx, quote.missionId);
    if (mission.isDemo) throw new Error("Demo quotes are read-only");
    if (
      args.total !== undefined &&
      (!Number.isFinite(args.total) ||
        args.total < 0 ||
        args.total > 10_000_000)
    )
      throw new Error("Total must be a valid positive amount");
    const missingFields = [
      args.total === undefined ? "total" : null,
      args.availability.trim() === "" || args.availability === "Not stated"
        ? "availability"
        : null,
      args.packing === "not_stated" ? "packing" : null,
      args.disassembly === "not_stated" ? "disassembly" : null,
      args.reassembly === "not_stated" ? "reassembly" : null,
      args.insurance === "not_stated" ? "insurance" : null,
    ].filter((field): field is string => field !== null);
    await ctx.db.patch("quotes", args.quoteId, {
      currency: args.currency.trim().toUpperCase() || "QAR",
      total: args.total,
      availability: args.availability.trim() || "Not stated",
      packing: args.packing,
      disassembly: args.disassembly,
      reassembly: args.reassembly,
      insurance: args.insurance,
      inclusions: args.inclusions
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 30),
      exclusions: args.exclusions
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 30),
      missingFields,
      manuallyEditedAt: Date.now(),
      manualEditNote: args.note.trim().slice(0, 500),
    });
    await ctx.db.insert("activityEvents", {
      workspaceId: mission.workspaceId,
      missionId: quote.missionId,
      type: "quote_corrected",
      title: "Quote corrected",
      description:
        "The extracted quote was reviewed and corrected by the user.",
      createdAt: Date.now(),
    });
    return null;
  },
});
