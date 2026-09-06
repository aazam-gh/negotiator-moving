export type MissionStatus =
  | "draft"
  | "collecting_requirements"
  | "ready_for_research"
  | "researching"
  | "reviewing_shortlist"
  | "awaiting_outreach_approval"
  | "contacting"
  | "waiting_for_responses"
  | "comparing"
  | "ready_to_choose"
  | "completed"
  | "paused"
  | "failed";

export function canonicalDomain(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function quoteCompleteness(fields: Record<string, unknown>) {
  const required = [
    "total",
    "availability",
    "disassembly",
    "reassembly",
    "insurance",
  ];
  const missing = required.filter(
    (key) =>
      fields[key] === undefined ||
      fields[key] === null ||
      fields[key] === "not_stated",
  );
  return {
    missing,
    score: (required.length - missing.length) / required.length,
  };
}

export function canTransition(from: MissionStatus, to: MissionStatus) {
  const transitions: Partial<Record<MissionStatus, MissionStatus[]>> = {
    ready_for_research: ["researching", "failed"],
    researching: ["reviewing_shortlist", "failed", "paused"],
    reviewing_shortlist: [
      "awaiting_outreach_approval",
      "researching",
      "failed",
    ],
    awaiting_outreach_approval: ["contacting", "paused", "failed"],
    contacting: ["waiting_for_responses", "failed"],
    waiting_for_responses: ["comparing", "paused", "failed"],
    comparing: ["ready_to_choose", "waiting_for_responses", "failed"],
    ready_to_choose: ["completed", "waiting_for_responses", "paused"],
  };
  return transitions[from]?.includes(to) ?? false;
}
