import { describe, expect, it } from "vitest";
import { canonicalDomain, canTransition, quoteCompleteness } from "./mission";

describe("mission utilities", () => {
  it("canonicalizes provider domains", () =>
    expect(canonicalDomain("https://www.Example.com/services?q=1")).toBe(
      "example.com",
    ));
  it("preserves unknown quote fields", () =>
    expect(
      quoteCompleteness({
        total: 900,
        availability: "available",
        disassembly: "included",
        reassembly: "not_stated",
        insurance: "not_stated",
      }),
    ).toEqual({ missing: ["reassembly", "insurance"], score: 0.6 }));
  it("allows only explicit state transitions", () => {
    expect(canTransition("ready_for_research", "researching")).toBe(true);
    expect(canTransition("ready_for_research", "completed")).toBe(false);
  });
});
