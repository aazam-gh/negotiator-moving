import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { qualifyProvider } from "../lib/negotiator-rules";
import { components, internal } from "./_generated/api";
import {
  action,
  env,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { requireMission } from "./model";
import type { Doc } from "./_generated/dataModel";

const firecrawl = new FirecrawlClient(components.firecrawl);
type Candidate = {
  name: string;
  website: string;
  canonicalDomain: string;
  contactEmail?: string;
  summary: string;
  serviceAreas: string[];
  fitScore: number;
  fitReasons: string[];
  concerns: string[];
};
const excludedDomains = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "yelp.com",
  "yellowpages",
  "reddit.com",
];

export const discover = action({
  args: { missionId: v.id("missions") },
  returns: v.object({ found: v.number() }),
  handler: async (ctx, { missionId }): Promise<{ found: number }> => {
    if (!(await getAuthUserId(ctx))) throw new Error("Authentication required");
    const runId = await ctx.runMutation(internal.research.startRun, {
      missionId,
    });
    try {
    if (!env.FIRECRAWL_API_KEY || env.FIRECRAWL_API_KEY === "not-configured") {
      throw new Error(
        "Firecrawl is not configured. Set FIRECRAWL_API_KEY in Convex.",
      );
    }
    const mission: Doc<"missions"> = await ctx.runQuery(
      internal.research.loadMission,
      {
        missionId,
      },
    );
    const query = `moving company ${mission.requirements.origin} ${mission.requirements.destination} residential movers contact`;
    const response = await firecrawl.search(ctx, query, {
      sources: ["web"],
      location: "Doha, Qatar",
      limit: 8,
      ignoreInvalidURLs: true,
    });
    const candidates: Candidate[] = (response.web ?? [])
      .map((row) => normalizeCandidate(row, mission.requirements))
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 12);
    await ctx.runMutation(internal.research.saveCandidates, {
      missionId,
      candidates,
      runId,
    });
    return { found: candidates.length };
    } catch (error) {
      await ctx.runMutation(internal.research.failRun, {
        runId,
        error: error instanceof Error ? error.message : "Provider research failed.",
      });
      throw error;
    }
  },
});

export const startRun = internalMutation({
  args: { missionId: v.id("missions") },
  returns: v.id("agentRuns"),
  handler: async (ctx, { missionId }) => {
    await requireMission(ctx, missionId);
    const existing = await ctx.db
      .query("agentRuns")
      .withIndex("by_missionId", (q) => q.eq("missionId", missionId))
      .order("desc")
      .take(20);
    const active = existing.find(
      (run) =>
        run.type === "provider_discovery" &&
        (run.status === "queued" || run.status === "running"),
    );
    if (active) return active._id;
    const now = Date.now();
    const runId = await ctx.db.insert("agentRuns", {
      missionId,
      type: "provider_discovery",
      status: "running",
      model: "deterministic-firecrawl-qualification",
      startedAt: now,
    });
    await ctx.db.patch(missionId, {
      status: "researching",
      lastError: undefined,
      updatedAt: now,
    });
    return runId;
  },
});

export const failRun = internalMutation({
  args: { runId: v.id("agentRuns"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, error }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status === "succeeded") return null;
    const now = Date.now();
    await ctx.db.patch(runId, { status: "failed", error, completedAt: now });
    await ctx.db.patch(run.missionId, {
      status: "failed",
      lastError: error,
      updatedAt: now,
    });
    await ctx.db.insert("activityEvents", {
      missionId: run.missionId,
      type: "research_failed",
      title: "Provider research failed",
      description: error,
      createdAt: now,
    });
    return null;
  },
});

export const loadMission = internalQuery({
  args: { missionId: v.id("missions") },
  returns: v.any(),
  handler: (ctx, { missionId }) => requireMission(ctx, missionId),
});

const candidateValidator = v.object({
  name: v.string(),
  website: v.string(),
  canonicalDomain: v.string(),
  contactEmail: v.optional(v.string()),
  summary: v.string(),
  serviceAreas: v.array(v.string()),
  fitScore: v.number(),
  fitReasons: v.array(v.string()),
  concerns: v.array(v.string()),
});

export const saveCandidates = internalMutation({
  args: {
    missionId: v.id("missions"),
    runId: v.id("agentRuns"),
    candidates: v.array(candidateValidator),
  },
  returns: v.null(),
  handler: async (ctx, { missionId, runId, candidates }) => {
    const now = Date.now();
    const run = await ctx.db.get(runId);
    if (!run || run.missionId !== missionId || run.type !== "provider_discovery")
      throw new Error("Invalid provider discovery run");
    await ctx.db.patch(runId, {
      status: "succeeded",
      completedAt: now,
      error: undefined,
    });
    await ctx.db.patch("missions", missionId, {
      status: "reviewing_shortlist",
      lastError: undefined,
      updatedAt: now,
    });
    for (const [index, candidate] of candidates.entries()) {
      const existing = await ctx.db
        .query("providers")
        .withIndex("by_canonicalDomain", (q) =>
          q.eq("canonicalDomain", candidate.canonicalDomain),
        )
        .unique();
      const providerId =
        existing?._id ??
        (await ctx.db.insert("providers", {
          name: candidate.name,
          canonicalDomain: candidate.canonicalDomain,
          website: candidate.website,
          contactEmail: candidate.contactEmail,
          location: candidate.serviceAreas[0],
          serviceAreas: candidate.serviceAreas,
          categories: ["moving"],
          summary: candidate.summary,
          isDemo: false,
          createdAt: now + index,
        }));
      if (existing && candidate.contactEmail && !existing.contactEmail)
        await ctx.db.patch("providers", existing._id, {
          contactEmail: candidate.contactEmail,
        });
      const link = await ctx.db
        .query("missionProviders")
        .withIndex("by_missionId_and_providerId", (q) =>
          q.eq("missionId", missionId).eq("providerId", providerId),
        )
        .unique();
      if (!link)
        await ctx.db.insert("missionProviders", {
          missionId,
          providerId,
          status: candidate.fitScore >= 60 ? "shortlisted" : "researched",
          fitScore: candidate.fitScore,
          fitReasons: candidate.fitReasons,
          concerns: candidate.concerns,
          selectedForOutreach: false,
          discoveredAt: now + index,
        });
      const priorSource = await ctx.db
        .query("researchSources")
        .withIndex("by_providerId", (q) => q.eq("providerId", providerId))
        .take(20);
      if (!priorSource.some((source) => source.url === candidate.website))
        await ctx.db.insert("researchSources", {
          missionId,
          providerId,
          url: candidate.website,
          title: candidate.name,
          sourceType: "provider_site",
          summary: candidate.summary,
          retrievedAt: now + index,
        });
    }
    await ctx.db.insert("activityEvents", {
      missionId,
      type: "shortlist_ready",
      title: "Shortlist ready",
      description: `${candidates.length} official provider sites were scored with visible criteria.`,
      createdAt: now,
    });
    return null;
  },
});

function normalizeCandidate(
  row: Record<string, unknown>,
  requirements: { origin: string; destination: string },
): Candidate | null {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const website = String(row.url ?? metadata.url ?? metadata.sourceURL ?? "");
  const canonicalDomain = domainOf(website);
  if (
    !website.startsWith("http") ||
    !canonicalDomain ||
    excludedDomains.some((domain) => canonicalDomain.includes(domain))
  )
    return null;
  const content = String(
    row.markdown ?? row.description ?? metadata.description ?? "",
  );
  if (!/\b(moving|movers|relocation)\b/i.test(content)) return null;
  const contactEmail = extractBusinessEmail(content, canonicalDomain);
  const qualification = qualifyProvider({
    content,
    origin: requirements.origin,
    destination: requirements.destination,
    domain: canonicalDomain,
    email: contactEmail,
  });
  const serviceAreas = [requirements.origin, requirements.destination].filter(
    (area) => area && content.toLowerCase().includes(area.toLowerCase()),
  );
  return {
    name: String(row.title ?? metadata.title ?? canonicalDomain).slice(0, 160),
    website,
    canonicalDomain,
    contactEmail,
    summary: content
      .replace(/[#*_`\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 700),
    serviceAreas,
    fitScore: qualification.score,
    fitReasons: qualification.reasons,
    concerns: qualification.concerns,
  };
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function extractBusinessEmail(content: string, domain: string) {
  const emails = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return emails.find(
    (email) =>
      email.toLowerCase().endsWith(`@${domain}`) &&
      !/noreply|no-reply/i.test(email),
  );
}
