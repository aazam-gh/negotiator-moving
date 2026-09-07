import { getAuthUserId } from "@convex-dev/auth/server";
import { vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireRegisteredUser } from "./model";
import { mailboxStatus } from "./schema";
import { workflows } from "./workflows";

export const me = query({
  args: {},
  returns: v.union(
    v.object({ authenticated: v.literal(false), registered: v.literal(false) }),
    v.object({ authenticated: v.literal(true), registered: v.literal(false) }),
    v.object({
      authenticated: v.literal(true),
      registered: v.literal(true),
      workspaceId: v.optional(v.id("workspaces")),
      mailbox: v.optional(
        v.object({
          status: mailboxStatus,
          address: v.optional(v.string()),
          lastError: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { authenticated: false as const, registered: false as const };
    const userId = await getAuthUserId(ctx);
    if (!userId) return { authenticated: false as const, registered: false as const };
    const user = await ctx.db.get("users", userId);
    if (!user || user.isAnonymous)
      return { authenticated: true as const, registered: false as const };
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
      .unique();
    const mailbox = workspace
      ? await ctx.db
          .query("mailboxes")
          .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
          .unique()
      : null;
    return {
      authenticated: true as const,
      registered: true as const,
      workspaceId: workspace?._id,
      mailbox: mailbox
        ? {
            status: mailbox.status,
            address: mailbox.address,
            lastError: mailbox.lastError,
          }
        : undefined,
    };
  },
});

export const ensureAccount = mutation({
  args: {},
  returns: v.object({
    workspaceId: v.id("workspaces"),
    mailboxId: v.id("mailboxes"),
    status: mailboxStatus,
  }),
  handler: async (ctx) => {
    const user = await requireRegisteredUser(ctx);
    const now = Date.now();
    let workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .unique();
    if (!workspace) {
      const workspaceId = await ctx.db.insert("workspaces", {
        ownerId: user._id,
        name: "My workspace",
        kind: "personal",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: user._id,
        role: "owner",
        createdAt: now,
      });
      workspace = (await ctx.db.get("workspaces", workspaceId))!;
    }
    let mailbox = await ctx.db
      .query("mailboxes")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
      .unique();
    if (!mailbox) {
      const mailboxId = await ctx.db.insert("mailboxes", {
        workspaceId: workspace._id,
        ownerId: user._id,
        provider: "agentmail",
        status: "pending",
        provisioningKey: `workspace.${workspace._id}`,
        createdAt: now,
        updatedAt: now,
      });
      mailbox = (await ctx.db.get("mailboxes", mailboxId))!;
    }
    if (mailbox.status !== "ready" && !mailbox.provisioningWorkflowId) {
      await ctx.db.patch("mailboxes", mailbox._id, {
        status: "pending",
        lastError: undefined,
        updatedAt: now,
      });
      const workflowId = await workflows.start(
        ctx,
        internal.accounts.provisionMailboxWorkflow,
        { mailboxId: mailbox._id },
        {
          onComplete: internal.accounts.onProvisionMailboxComplete,
          context: { mailboxId: mailbox._id },
          startAsync: true,
        },
      );
      await ctx.db.patch("mailboxes", mailbox._id, {
        provisioningWorkflowId: String(workflowId),
      });
    }
    return {
      workspaceId: workspace._id,
      mailboxId: mailbox._id,
      status: mailbox.status,
    };
  },
});

export const provisionMailboxWorkflow = workflows
  .define({
    args: { mailboxId: v.id("mailboxes") },
    returns: v.null(),
  })
  .handler(async (step, { mailboxId }): Promise<null> => {
    const created = await step.runAction(
      internal.accounts.createRemoteInbox,
      { mailboxId },
      {
        retry: { maxAttempts: 5, initialBackoffMs: 1_000, base: 2 },
        name: "Create isolated AgentMail inbox",
      },
    );
    if (created.status === "failed") {
      await step.runMutation(
        internal.accounts.markMailboxProvisioningFailed,
        { mailboxId, error: created.error },
        { inline: true, name: "Record mailbox capacity limit" },
      );
      return null;
    }
    await step.runMutation(
      internal.accounts.markMailboxReady,
      { mailboxId, inboxId: created.inboxId, address: created.address },
      { inline: true, name: "Persist isolated mailbox" },
    );
    return null;
  });

export const createRemoteInbox = internalAction({
  args: { mailboxId: v.id("mailboxes") },
  returns: v.union(
    v.object({
      status: v.literal("ready"),
      inboxId: v.string(),
      address: v.string(),
    }),
    v.object({ status: v.literal("failed"), error: v.string() }),
  ),
  handler: async (ctx, { mailboxId }) => {
    const state = await ctx.runQuery(internal.accounts.loadMailboxForProvisioning, {
      mailboxId,
    });
    const response = await fetch(
      `${env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0"}/inboxes`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AGENTMAIL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: `neg-${String(state.workspaceId).slice(-16).toLowerCase()}`,
          display_name: "Negotiator",
          client_id: state.provisioningKey.replace(/[^A-Za-z0-9._~-]/g, "-"),
        }),
      },
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      if (response.status === 403 && detail.includes("limit_exceeded")) {
        return {
          status: "failed" as const,
          error:
            "AgentMail inbox capacity has been reached. Increase the AgentMail inbox limit, then retry setup.",
        };
      }
      throw new Error(`AgentMail inbox creation failed (${response.status}): ${detail}`);
    }
    const remote = (await response.json()) as {
      inbox_id?: string;
      inboxId?: string;
      email?: string;
      address?: string;
    };
    const inboxId = String(remote?.inbox_id ?? remote?.inboxId ?? "");
    const address = String(remote?.email ?? remote?.address ?? "");
    if (!inboxId || !address) throw new Error("AgentMail returned an invalid inbox");
    return { status: "ready" as const, inboxId, address };
  },
});

export const markMailboxProvisioningFailed = internalMutation({
  args: { mailboxId: v.id("mailboxes"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const mailbox = await ctx.db.get("mailboxes", args.mailboxId);
    if (!mailbox) return null;
    await ctx.db.patch("mailboxes", mailbox._id, {
      status: "failed",
      provisioningWorkflowId: undefined,
      lastError: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const loadMailboxForProvisioning = internalQuery({
  args: { mailboxId: v.id("mailboxes") },
  returns: v.object({
    workspaceId: v.id("workspaces"),
    provisioningKey: v.string(),
  }),
  handler: async (ctx, { mailboxId }) => {
    const mailbox = await ctx.db.get("mailboxes", mailboxId);
    if (!mailbox) throw new Error("Mailbox not found");
    return {
      workspaceId: mailbox.workspaceId,
      provisioningKey: mailbox.provisioningKey,
    };
  },
});

export const markMailboxReady = internalMutation({
  args: {
    mailboxId: v.id("mailboxes"),
    inboxId: v.string(),
    address: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const mailbox = await ctx.db.get("mailboxes", args.mailboxId);
    if (!mailbox) throw new Error("Mailbox not found");
    const claimed = await ctx.db
      .query("mailboxes")
      .withIndex("by_inboxId", (q) => q.eq("inboxId", args.inboxId))
      .unique();
    if (claimed && claimed._id !== mailbox._id)
      throw new Error("AgentMail inbox is already assigned to another workspace");
    await ctx.db.patch("mailboxes", mailbox._id, {
      status: "ready",
      inboxId: args.inboxId,
      address: args.address,
      lastError: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const onProvisionMailboxComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ mailboxId: v.id("mailboxes") }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const mailbox = await ctx.db.get("mailboxes", args.context.mailboxId);
    if (!mailbox) return null;
    if (args.result.kind === "failed") {
      await ctx.db.patch("mailboxes", mailbox._id, {
        status: "failed",
        provisioningWorkflowId: undefined,
        lastError: args.result.error.slice(0, 500),
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
