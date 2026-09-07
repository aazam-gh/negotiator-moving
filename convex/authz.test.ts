import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

describe("workspace isolation", () => {
  it("keeps each registered user's mailbox, mission, messages, and quotes private", async () => {
    const t = convexTest({ schema, modules });
    const fixture = await t.run(async (ctx) => {
      const now = Date.now();
      const aliceId = await ctx.db.insert("users", {
        email: "alice@example.test",
      });
      const bobId = await ctx.db.insert("users", {
        email: "bob@example.test",
      });
      const aliceWorkspaceId = await createWorkspace(ctx, aliceId, "alice");
      const bobWorkspaceId = await createWorkspace(ctx, bobId, "bob");
      await createMailbox(ctx, aliceWorkspaceId, aliceId, "alice-inbox", "alice@agent.test");
      await createMailbox(ctx, bobWorkspaceId, bobId, "bob-inbox", "bob@agent.test");
      const missionId = await ctx.db.insert("missions", {
        ownerId: aliceId,
        createdBy: aliceId,
        workspaceId: aliceWorkspaceId,
        isDemo: false,
        title: "Alice move",
        category: "moving",
        rawRequest: "Move Alice",
        status: "comparing",
        currency: "QAR",
        requirements: {
          origin: "Doha",
          destination: "Lusail",
          requestedDate: "Tomorrow",
          propertySize: "Apartment",
        },
        targetQuoteCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      const providerId = await ctx.db.insert("providers", {
        name: "Private mover",
        canonicalDomain: "private.example",
        website: "https://private.example",
        serviceAreas: ["Doha"],
        categories: ["moving"],
        summary: "Private mission provider",
        isDemo: false,
        createdAt: now,
      });
      await ctx.db.insert("missionProviders", {
        missionId,
        providerId,
        status: "replied",
        fitReasons: [],
        concerns: [],
        selectedForOutreach: true,
        discoveredAt: now,
      });
      const threadId = await ctx.db.insert("outreachThreads", {
        workspaceId: aliceWorkspaceId,
        missionId,
        providerId,
        inboxId: "alice-inbox",
        status: "replied",
        subject: "Private quote",
        lastMessageAt: now,
      });
      const messageId = await ctx.db.insert("messages", {
        workspaceId: aliceWorkspaceId,
        missionId,
        providerId,
        threadId,
        direction: "inbound",
        subject: "Private quote",
        bodyText: "QAR 900",
        externalMessageId: "alice-message",
        classification: "quote",
        occurredAt: now,
      });
      const quoteId = await ctx.db.insert("quotes", {
        workspaceId: aliceWorkspaceId,
        missionId,
        providerId,
        sourceMessageId: messageId,
        currency: "QAR",
        total: 900,
        availability: "Available",
        packing: "not_stated",
        disassembly: "included",
        reassembly: "included",
        insurance: "not_stated",
        inclusions: [],
        exclusions: [],
        missingFields: ["insurance"],
        confidence: 0.9,
        rawExtraction: "test",
        createdAt: now,
      });
      return { aliceId, bobId, missionId, quoteId };
    });

    const alice = t.withIdentity({ subject: `${fixture.aliceId}|test-session` });
    const bob = t.withIdentity({ subject: `${fixture.bobId}|test-session` });
    await expect(alice.query(api.accounts.me, {})).resolves.toMatchObject({
      registered: true,
      mailbox: { status: "ready", address: "alice@agent.test" },
    });
    await expect(bob.query(api.accounts.me, {})).resolves.toMatchObject({
      registered: true,
      mailbox: { status: "ready", address: "bob@agent.test" },
    });
    await expect(alice.query(api.missions.dashboard, { missionId: fixture.missionId }))
      .resolves.toMatchObject({ mission: { title: "Alice move" } });
    await expect(bob.query(api.missions.dashboard, { missionId: fixture.missionId }))
      .rejects.toThrow("Mission not found");
    await expect(
      bob.mutation(api.quotes.correct, {
        quoteId: fixture.quoteId,
        currency: "QAR",
        total: 1,
        availability: "Available",
        packing: "included",
        disassembly: "included",
        reassembly: "included",
        insurance: "included",
        inclusions: [],
        exclusions: [],
        note: "attempted cross-tenant edit",
      }),
    ).rejects.toThrow("Mission not found");
  });
});

async function createWorkspace(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
) {
  const now = Date.now();
  const workspaceId = await ctx.db.insert("workspaces", {
    ownerId: userId,
    name,
    kind: "personal",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("workspaceMembers", {
    workspaceId,
    userId,
    role: "owner",
    createdAt: now,
  });
  return workspaceId;
}

async function createMailbox(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  ownerId: Id<"users">,
  inboxId: string,
  address: string,
) {
  const now = Date.now();
  return ctx.db.insert("mailboxes", {
    workspaceId,
    ownerId,
    provider: "agentmail",
    status: "ready",
    inboxId,
    address,
    provisioningKey: `workspace:${workspaceId}`,
    createdAt: now,
    updatedAt: now,
  });
}
