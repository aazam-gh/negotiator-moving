import { describe, expect, it } from "vitest";
import {
  formatMovingRfq,
  parseMovingRequest,
  parseProviderReply,
  qualifyProvider,
  quoteLabels,
} from "./negotiator-rules";

describe("deterministic Negotiator rules", () => {
  it("extracts only obvious moving requirements", () => {
    expect(
      parseMovingRequest(
        "Move a 2-bedroom apartment from West Bay, Doha to Lusail next Saturday with disassembly and reassembly but no packing.",
      ),
    ).toMatchObject({
      origin: "West Bay, Doha",
      destination: "Lusail",
      requestedDate: "next Saturday",
      bedrooms: 2,
      packingRequired: false,
      disassemblyRequired: true,
      reassemblyRequired: true,
    });
  });
  it("leaves uncertain requirements unset", () => {
    expect(parseMovingRequest("I need help moving soon")).toMatchObject({
      origin: "",
      destination: "",
      requestedDate: "",
      propertySize: "",
    });
  });
  it("builds a transparent provider score", () => {
    const result = qualifyProvider({
      content: "Doha residential apartment moving and furniture packing",
      origin: "Doha",
      destination: "Lusail",
      domain: "example.com",
      email: "quotes@example.com",
    });
    expect(result.score).toBe(100);
    expect(result.reasons).toContain("+25 Explicitly offers moving services");
  });
  it.each([
    ["QAR 1,200", "QAR", 1200],
    ["1,200 QAR", "QAR", 1200],
    ["AED 900", "AED", 900],
    ["$500", "USD", 500],
    ["total: 1250", "QAR", 1250],
  ])("extracts conservative money pattern %s", (body, currency, total) => {
    expect(parseProviderReply("Quote", body)).toMatchObject({
      classification: "quote",
      currency,
      total,
    });
  });
  it("preserves unknown service fields", () => {
    const quote = parseProviderReply(
      "Quote",
      "We are available. Total: QAR 1,150. Disassembly is included.",
    );
    expect(quote.reassembly).toBe("not_stated");
    expect(quote.missingFields).toContain("reassembly");
  });
  it("marks ambiguous replies for review", () =>
    expect(
      parseProviderReply("Re: request", "Let's discuss this soon.")
        .classification,
    ).toBe("needs_review"));
  it("generates a category-specific RFQ", () =>
    expect(
      formatMovingRfq({
        origin: "Doha",
        destination: "Lusail",
        requestedDate: "Saturday",
        propertySize: "2-bedroom apartment",
        packingRequired: false,
      }),
    ).toContain("Packing: Not required"));
  it("labels comparisons using visible criteria", () =>
    expect(
      quoteLabels([
        { total: 900, missingFields: ["insurance"], inclusions: ["transport"] },
        {
          total: 950,
          missingFields: [],
          inclusions: ["transport", "insurance"],
        },
      ]),
    ).toEqual([
      ["LOWEST PRICE"],
      ["MOST COMPLETE QUOTE", "MOST CONFIRMED INCLUSIONS"],
    ]));
});
