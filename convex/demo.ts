import { v } from "convex/values";
import { mutation } from "./_generated/server";

const fixtures = [
  {
    name: "Northstar Moving — Demo",
    domain: "northstar.demo",
    score: 94,
    total: 1150,
    availability: "Available",
    reassembly: "included" as const,
    insurance: "included" as const,
    summary: "Residential moving specialist serving Doha and Lusail.",
    reasons: [
      "+30 Serves the requested area",
      "+25 Explicitly offers moving services",
      "+15 Offers residential moves",
      "+10 Mentions furniture handling",
      "+10 Publishes a business email",
      "+4 Demo website evidence",
    ],
    concerns: ["Insurance limit is not stated on the service page."],
  },
  {
    name: "Harbor & Home — Demo",
    domain: "harbor-home.demo",
    score: 89,
    total: 980,
    availability: "Available",
    reassembly: "included" as const,
    insurance: "not_stated" as const,
    summary: "Apartment relocations with crews available on weekends.",
    reasons: [
      "+30 Serves the requested area",
      "+25 Explicitly offers moving services",
      "+15 Offers residential moves",
      "+10 Mentions packing",
      "+9 Publishes contact information",
    ],
    concerns: ["Stair carry fees may apply."],
  },
  {
    name: "Blue Route Logistics — Demo",
    domain: "blue-route.demo",
    score: 83,
    total: 920,
    availability: "Needs confirmation",
    reassembly: "not_stated" as const,
    insurance: "not_stated" as const,
    summary: "Local mover covering Doha’s northern residential corridor.",
    reasons: [
      "+30 Serves the requested area",
      "+25 Explicitly offers moving services",
      "+10 Has a canonical business website",
      "+10 Mentions furniture handling",
      "+8 Publishes contact information",
    ],
    concerns: ["Reassembly is not mentioned in public materials."],
  },
];

export const seed = mutation({
  args: {},
  returns: v.id("missions"),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("missions")
      .withIndex("by_demoKey", (q) => q.eq("demoKey", "moving-v3"))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    const missionId = await ctx.db.insert("missions", {
      demoKey: "moving-v3",
      isDemo: true,
      title: "Apartment move",
      category: "moving",
      rawRequest: "Demo: 2-bedroom apartment move from West Bay to Lusail.",
      status: "ready_to_choose",
      currency: "QAR",
      requirements: {
        origin: "West Bay, Doha",
        destination: "Lusail",
        requestedDate: "Next Saturday",
        propertySize: "2-bedroom apartment",
        bedrooms: 2,
        packingRequired: false,
        disassemblyRequired: true,
        reassemblyRequired: true,
      },
      targetQuoteCount: 3,
      createdAt: now,
      updatedAt: now,
    });
    for (let index = 0; index < fixtures.length; index++) {
      const item = fixtures[index];
      const providerId = await ctx.db.insert("providers", {
        name: item.name,
        canonicalDomain: item.domain,
        website: `https://${item.domain}`,
        location: "Doha",
        serviceAreas: ["Doha", "Lusail"],
        categories: ["moving"],
        summary: item.summary,
        isDemo: true,
        createdAt: now + index,
      });
      await ctx.db.insert("missionProviders", {
        missionId,
        providerId,
        status: "replied",
        fitScore: item.score,
        fitReasons: item.reasons,
        concerns: item.concerns,
        selectedForOutreach: true,
        discoveredAt: now + index,
        contactedAt: now + 300_000,
        repliedAt: now + 1_200_000 + index,
      });
      await ctx.db.insert("researchSources", {
        missionId,
        providerId,
        url: `https://${item.domain}/demo-source`,
        title: "Demo provider profile",
        sourceType: "demo_fixture",
        summary: "Fictional research fixture for product demonstration.",
        retrievedAt: now + index,
      });
      const threadId = await ctx.db.insert("outreachThreads", {
        missionId,
        providerId,
        inboxId: "demo-inbox",
        agentMailThreadId: `demo-thread-${index}`,
        status: "replied",
        subject: "Quote request: West Bay to Lusail apartment move",
        lastMessageAt: now + 1_200_000 + index,
      });
      const messageId = await ctx.db.insert("messages", {
        missionId,
        providerId,
        threadId,
        direction: "inbound",
        subject: "Re: Quote request",
        bodyText: `Demo reply: ${item.availability === "Available" ? "We are available on the requested date." : "Availability needs confirmation."} Our total quote is QAR ${item.total}. Furniture disassembly is included. Packing is not included.${item.reassembly === "included" ? " Furniture reassembly is included." : ""}${item.insurance === "included" ? " Insurance is included." : ""}`,
        externalMessageId: `demo-message-${index}`,
        classification: "quote",
        occurredAt: now + 1_200_000 + index,
      });
      await ctx.db.insert("quotes", {
        missionId,
        providerId,
        sourceMessageId: messageId,
        currency: "QAR",
        total: item.total,
        availability: item.availability,
        packing: "not_included",
        disassembly: "included",
        reassembly: item.reassembly,
        insurance: item.insurance,
        inclusions: [
          "Moving crew",
          "Transport",
          "Furniture disassembly",
          ...(item.reassembly === "included" ? ["Furniture reassembly"] : []),
          ...(item.insurance === "included" ? ["Insurance"] : []),
        ],
        exclusions: ["Packing is not included"],
        missingFields:
          item.reassembly === "not_stated"
            ? ["reassembly", "insurance"]
            : item.insurance === "not_stated"
              ? ["insurance"]
              : [],
        confidence: 0.9 - index * 0.04,
        rawExtraction: "Demo structured extraction",
        createdAt: now + 1_200_000 + index,
      });
    }
    const events = [
      [
        "mission_created",
        "Mission created",
        "Requirements confirmed for a 2-bedroom apartment move.",
      ],
      [
        "research_started",
        "Searching the web",
        "Looking for moving companies serving Doha and Lusail.",
      ],
      [
        "shortlist_ready",
        "Shortlist ready",
        "Three demo providers matched the requirements.",
      ],
      [
        "outreach_sent",
        "Quote requests sent",
        "Three approved demo providers were contacted.",
      ],
      [
        "provider_replied",
        "Provider replied",
        "A demo provider sent pricing and availability.",
      ],
      [
        "quote_extracted",
        "Quote extracted",
        "Three demo quotes are ready to compare.",
      ],
    ];
    for (let i = 0; i < events.length; i++) {
      const [type, title, description] = events[i];
      await ctx.db.insert("activityEvents", {
        missionId,
        type,
        title,
        description,
        createdAt: now + i * 60_000,
      });
    }
    return missionId;
  },
});
