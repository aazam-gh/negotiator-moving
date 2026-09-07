import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Authentication required");
  return userId;
}
export async function requireRegisteredUser(ctx: QueryCtx | MutationCtx) {
  const userId = await requireUser(ctx);
  const user = await ctx.db.get("users", userId);
  if (!user || user.isAnonymous)
    throw new Error("Create or sign in to an account to continue");
  return user;
}
export async function requireWorkspaceMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Doc<"workspaces">["_id"],
) {
  const user = await requireRegisteredUser(ctx);
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspaceId_and_userId", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", user._id),
    )
    .unique();
  if (!membership) throw new Error("Workspace not found");
  return { user, membership };
}
export async function requirePersonalWorkspace(ctx: QueryCtx | MutationCtx) {
  const user = await requireRegisteredUser(ctx);
  const workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
    .unique();
  if (!workspace)
    throw new Error("Your account is still being prepared. Please try again.");
  await requireWorkspaceMember(ctx, workspace._id);
  return { user, workspace };
}
export async function requireMission(
  ctx: QueryCtx | MutationCtx,
  missionId: Doc<"missions">["_id"],
) {
  const mission = await ctx.db.get("missions", missionId);
  if (!mission) throw new Error("Mission not found");
  if (mission.isDemo) throw new Error("Demo missions are read-only");
  const user = await requireRegisteredUser(ctx);
  if (mission.ownerId !== user._id) throw new Error("Mission not found");
  if (mission.workspaceId) await requireWorkspaceMember(ctx, mission.workspaceId);
  return mission;
}
export async function requireReadableMission(
  ctx: QueryCtx | MutationCtx,
  missionId: Doc<"missions">["_id"],
) {
  const mission = await ctx.db.get("missions", missionId);
  if (!mission) throw new Error("Mission not found");
  if (mission.isDemo) return mission;
  return requireMission(ctx, missionId);
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
