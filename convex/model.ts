import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Authentication required");
  return userId;
}
export async function requireMission(
  ctx: QueryCtx | MutationCtx,
  missionId: Doc<"missions">["_id"],
) {
  const mission = await ctx.db.get("missions", missionId);
  if (!mission) throw new Error("Mission not found");
  if (mission.isDemo) return mission;
  const userId = await requireUser(ctx);
  if (mission.ownerId !== userId) throw new Error("Mission not found");
  return mission;
}
export const transitions: Record<
  Doc<"missions">["status"],
  readonly Doc<"missions">["status"][]
> = {
  draft: ["collecting_requirements", "failed"],
  collecting_requirements: ["ready_for_research", "failed"],
  ready_for_research: ["researching", "failed"],
  researching: ["reviewing_shortlist", "failed", "paused"],
  reviewing_shortlist: ["awaiting_outreach_approval", "researching", "failed"],
  awaiting_outreach_approval: ["contacting", "paused", "failed"],
  contacting: ["waiting_for_responses", "failed"],
  waiting_for_responses: ["comparing", "paused", "failed"],
  comparing: ["ready_to_choose", "waiting_for_responses", "failed"],
  ready_to_choose: ["completed", "waiting_for_responses", "paused"],
  completed: [],
  paused: [
    "researching",
    "awaiting_outreach_approval",
    "waiting_for_responses",
  ],
  failed: ["ready_for_research", "researching", "contacting"],
};
export function assertTransition(
  from: Doc<"missions">["status"],
  to: Doc<"missions">["status"],
) {
  if (!transitions[from].includes(to))
    throw new Error(`Invalid mission transition: ${from} → ${to}`);
}
