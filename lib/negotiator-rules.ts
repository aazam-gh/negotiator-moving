export type TriState =
  | "included"
  | "not_included"
  | "not_stated"
  | "needs_clarification";

export type MovingDraft = {
  title: string;
  origin: string;
  destination: string;
  requestedDate: string;
  propertySize: string;
  bedrooms?: number;
  packingRequired?: boolean;
  disassemblyRequired?: boolean;
  reassemblyRequired?: boolean;
  specialItems?: string;
  elevatorAvailability?: string;
  budget?: number;
  notes?: string;
};

const moneyNumber = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)/;

export function parseMovingRequest(input: string): MovingDraft {
  const text = input.replace(/\s+/g, " ").trim();
  const route = text.match(
    /\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:on|by|with|without|next|this)\b|[.;]|$)/i,
  );
  const cityContext = text
    .match(
      /\b(?:movers?|moving)\s+in\s+([A-Za-z][A-Za-z ]+?)(?=\s+(?:next|this|on|for|from)\b)/i,
    )?.[1]
    ?.trim();
  const parsedOrigin = route?.[1]?.trim() ?? "";
  const bedrooms = text.match(/\b(\d+)\s*[- ]?bed(?:room)?s?\b/i);
  const date = text.match(
    /\b(?:on\s+)?((?:next|this)\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|(?:mon|tues|wednes|thurs|fri|satur|sun)day(?:,?\s+[A-Z][a-z]+\s+\d{1,2})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i,
  );
  const budget = text.match(
    new RegExp(
      `(?:budget(?:\\s+is|\\s+of|:)?|under|up to|max(?:imum)?)\\s*(?:QAR|QR|AED|USD|\\$)?\\s*${moneyNumber.source}`,
      "i",
    ),
  );
  const property = bedrooms
    ? `${Number(bedrooms[1])}-bedroom ${/villa/i.test(text) ? "villa" : "apartment"}`
    : (text.match(/\b(studio|villa|apartment|house|office)\b/i)?.[1] ?? "");
  const negativePacking =
    /\b(?:no|without|do not need|don't need)\s+(?:any\s+)?packing\b/i.test(
      text,
    );
  const negativeDisassembly =
    /\b(?:no|without|do not need|don't need)\s+(?:furniture\s+)?disassembly\b/i.test(
      text,
    );
  const negativeReassembly =
    /\b(?:no|without|do not need|don't need)\s+(?:furniture\s+)?reassembly\b/i.test(
      text,
    );
  const specialItems = text.match(
    /\b(piano|safe|artwork|antiques?|pool table|grandfather clock)\b/gi,
  );
  const elevator = text.match(
    /\b(?:elevator|lift)\s+(?:is\s+)?(available|unavailable|not available)\b/i,
  );
  return {
    title: property
      ? `${property[0].toUpperCase()}${property.slice(1)} move`
      : "Moving mission",
    origin:
      cityContext &&
      parsedOrigin &&
      !parsedOrigin.toLowerCase().includes(cityContext.toLowerCase())
        ? `${parsedOrigin}, ${cityContext}`
        : parsedOrigin,
    destination: route?.[2]?.trim() ?? "",
    requestedDate: date?.[1] ?? "",
    propertySize: property,
    bedrooms: bedrooms ? Number(bedrooms[1]) : undefined,
    packingRequired: negativePacking
      ? false
      : /\bpacking\b/i.test(text)
        ? true
        : undefined,
    disassemblyRequired: negativeDisassembly
      ? false
      : /\bdisassembl(?:y|e|ing)\b/i.test(text)
        ? true
        : undefined,
    reassemblyRequired: negativeReassembly
      ? false
      : /\breassembl(?:y|e|ing)\b/i.test(text)
        ? true
        : undefined,
    specialItems: specialItems
      ? [...new Set(specialItems.map((item) => item.toLowerCase()))].join(", ")
      : undefined,
    elevatorAvailability: elevator?.[1],
    budget: budget ? parseMoney(budget[1]) : undefined,
  };
}

export function formatMovingRfq(
  requirements: Omit<MovingDraft, "title">,
  userName = "the customer",
) {
  const answer = (value: boolean | undefined) =>
    value === true
      ? "Required"
      : value === false
        ? "Not required"
        : "Please confirm";
  return `Hi,\n\nI'm Negotiator, assisting ${userName} in gathering quotes for a move from ${requirements.origin} to ${requirements.destination} on ${requirements.requestedDate}.\n\nDetails:\n- Property: ${requirements.propertySize}\n- Packing: ${answer(requirements.packingRequired)}\n- Furniture disassembly: ${answer(requirements.disassemblyRequired)}\n- Furniture reassembly: ${answer(requirements.reassemblyRequired)}${requirements.specialItems ? `\n- Special items: ${requirements.specialItems}` : ""}\n\nCould you please confirm availability and provide your total quote, including any additional charges or important exclusions?\n\nThank you,\nNegotiator\non behalf of ${userName}`;
}

export function qualifyProvider(input: {
  content: string;
  origin: string;
  destination: string;
  domain: string;
  email?: string;
}) {
  const haystack = input.content.toLowerCase();
  const criteria = [
    {
      points: 30,
      label: "Serves the requested area",
      match: containsAny(haystack, [
        input.origin,
        input.destination,
        "doha",
        "qatar",
      ]),
    },
    {
      points: 25,
      label: "Explicitly offers moving services",
      match: /\b(moving|movers|relocation)\b/.test(haystack),
    },
    {
      points: 15,
      label: "Offers residential moves",
      match: /\b(residential|home|house|apartment|villa)\b/.test(haystack),
    },
    {
      points: 10,
      label: "Mentions packing or furniture handling",
      match: /\b(packing|unpacking|disassembly|reassembly|furniture)\b/.test(
        haystack,
      ),
    },
    {
      points: 10,
      label: "Publishes a business email",
      match: Boolean(input.email),
    },
    {
      points: 10,
      label: "Has a canonical business website",
      match: Boolean(input.domain),
    },
  ];
  return {
    score: criteria
      .filter((item) => item.match)
      .reduce((sum, item) => sum + item.points, 0),
    reasons: criteria
      .filter((item) => item.match)
      .map((item) => `+${item.points} ${item.label}`),
    concerns: criteria
      .filter((item) => !item.match)
      .map((item) => `Not verified: ${item.label.toLowerCase()}`),
  };
}

export type ParsedProviderReply = {
  classification:
    | "quote"
    | "needs_more_information"
    | "decline"
    | "acknowledgement"
    | "out_of_office"
    | "unrelated"
    | "needs_review";
  currency: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  availability: string;
  packing: TriState;
  disassembly: TriState;
  reassembly: TriState;
  insurance: TriState;
  inclusions: string[];
  exclusions: string[];
  missingFields: string[];
  confidence: number;
};

export function parseProviderReply(
  subject: string,
  body: string,
  defaultCurrency = "QAR",
): ParsedProviderReply {
  const text = `${subject}\n${body}`.replace(/\r/g, "");
  const money = extractMoney(text, defaultCurrency);
  const outOfOffice =
    /out of (?:the )?office|automatic reply|auto[- ]?reply|away from (?:the )?office/i.test(
      text,
    );
  const decline =
    /unable to (?:assist|help|quote)|cannot (?:assist|help|provide)|not available|fully booked|decline/i.test(
      text,
    );
  const asksQuestion =
    /(?:could you|please (?:confirm|provide)|what (?:floor|date|size)|need more information|more details)/i.test(
      text,
    );
  const acknowledgement =
    /(?:thank you|thanks).*(?:request|enquiry|inquiry)|we (?:have )?received/i.test(
      text,
    );
  const unrelated = /unsubscribe|marketing newsletter|password reset/i.test(
    text,
  );
  const classification = outOfOffice
    ? "out_of_office"
    : decline
      ? "decline"
      : money.total !== undefined
        ? "quote"
        : asksQuestion
          ? "needs_more_information"
          : acknowledgement
            ? "acknowledgement"
            : unrelated
              ? "unrelated"
              : "needs_review";
  const availability = /\b(?:we are|crew is|slot is)?\s*available\b/i.test(text)
    ? "Available"
    : /\b(?:not available|fully booked|no availability)\b/i.test(text)
      ? "Unavailable"
      : "Not stated";
  const packing = explicitServiceState(text, "packing");
  const disassembly = explicitServiceState(text, "disassembly");
  const reassembly = explicitServiceState(text, "reassembly");
  const insurance = explicitServiceState(text, "insurance");
  const inclusions = sentenceMatches(
    text,
    /\b(?:include[sd]?|inclusive of)\b/i,
  );
  const exclusions = sentenceMatches(
    text,
    /\b(?:exclude[sd]?|not included|additional charge|extra fee)\b/i,
  );
  const fields = {
    total: money.total,
    availability,
    packing,
    disassembly,
    reassembly,
    insurance,
  };
  const missingFields = Object.entries(fields)
    .filter(
      ([, value]) =>
        value === undefined || value === "Not stated" || value === "not_stated",
    )
    .map(([key]) => key);
  const confirmed = 6 - missingFields.length;
  return {
    classification,
    currency: money.currency,
    total: money.total,
    availability,
    packing,
    disassembly,
    reassembly,
    insurance,
    inclusions,
    exclusions,
    missingFields,
    confidence: Number((confirmed / 6).toFixed(2)),
  };
}

export function quoteLabels(
  quotes: Array<{
    total?: number;
    missingFields: string[];
    inclusions: string[];
  }>,
) {
  const totals = quotes
    .map((quote) => quote.total)
    .filter((value): value is number => typeof value === "number");
  const lowest = totals.length ? Math.min(...totals) : undefined;
  const mostComplete = quotes.length
    ? Math.min(...quotes.map((quote) => quote.missingFields.length))
    : undefined;
  const mostIncluded = quotes.length
    ? Math.max(...quotes.map((quote) => quote.inclusions.length))
    : undefined;
  return quotes.map((quote) => [
    ...(quote.total === lowest ? ["LOWEST PRICE"] : []),
    ...(quote.missingFields.length === mostComplete
      ? ["MOST COMPLETE QUOTE"]
      : []),
    ...(quote.inclusions.length === mostIncluded
      ? ["MOST CONFIRMED INCLUSIONS"]
      : []),
  ]);
}

function parseMoney(value: string) {
  return Number(value.replace(/,/g, ""));
}
function containsAny(haystack: string, values: string[]) {
  return values.some(
    (value) => value && haystack.includes(value.toLowerCase()),
  );
}
function extractMoney(text: string, defaultCurrency: string) {
  const patterns = [
    /\b(QAR|QR|AED|USD)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(QAR|QR|AED|USD)\b/i,
    /\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/,
    /\b(?:total|quote|price)\s*(?::|is)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ];
  for (const [index, pattern] of patterns.entries()) {
    const match = text.match(pattern);
    if (!match) continue;
    if (index === 0)
      return {
        currency:
          match[1].toUpperCase() === "QR" ? "QAR" : match[1].toUpperCase(),
        total: parseMoney(match[2]),
      };
    if (index === 1)
      return {
        currency:
          match[2].toUpperCase() === "QR" ? "QAR" : match[2].toUpperCase(),
        total: parseMoney(match[1]),
      };
    if (index === 2) return { currency: "USD", total: parseMoney(match[1]) };
    return { currency: defaultCurrency, total: parseMoney(match[1]) };
  }
  return { currency: defaultCurrency, total: undefined };
}
function explicitServiceState(text: string, service: string): TriState {
  const escaped = service.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const excluded = new RegExp(
    `(?:${escaped}.{0,24}(?:not included|excluded|extra|additional)|(?:not included|excluded).{0,24}${escaped})`,
    "i",
  );
  const included = new RegExp(
    `(?:${escaped}.{0,24}(?:included|inclusive|covered)|(?:includes?|inclusive of).{0,24}${escaped})`,
    "i",
  );
  return excluded.test(text)
    ? "not_included"
    : included.test(text)
      ? "included"
      : "not_stated";
}
function sentenceMatches(text: string, pattern: RegExp) {
  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line && pattern.test(line))
    .slice(0, 8);
}
