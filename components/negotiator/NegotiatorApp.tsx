"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  Inbox,
  Mail,
  MapPin,
  SlidersHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthPanel } from "@/components/AuthPanel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  parseMovingRequest,
  quoteLabels,
  type MovingDraft,
  type TriState,
} from "@/lib/negotiator-rules";

type View = "landing" | "requirements" | "mission";
const initialRequest =
  "I need movers in Doha next Saturday for a 2-bedroom apartment from West Bay to Lusail. I need furniture disassembly and reassembly but no packing.";

const demoProviders = [
  {
    id: "northstar-demo",
    name: "Northstar Moving — Demo",
    score: 94,
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
    status: "Replied",
    canContact: true,
  },
  {
    id: "harbor-demo",
    name: "Harbor & Home — Demo",
    score: 89,
    summary: "Apartment relocations with crews available on weekends.",
    reasons: [
      "+30 Serves the requested area",
      "+25 Explicitly offers moving services",
      "+15 Offers residential moves",
      "+10 Mentions packing",
      "+9 Publishes contact information",
    ],
    concerns: ["Stair carry fees may apply."],
    status: "Replied",
    canContact: true,
  },
  {
    id: "blue-route-demo",
    name: "Blue Route Logistics — Demo",
    score: 83,
    summary: "Local mover covering Doha’s northern residential corridor.",
    reasons: [
      "+30 Serves the requested area",
      "+25 Explicitly offers moving services",
      "+10 Has a canonical business website",
      "+10 Mentions furniture handling",
      "+8 Publishes contact information",
    ],
    concerns: ["Reassembly is not mentioned in public materials."],
    status: "Replied",
    canContact: true,
  },
];
const demoQuotes = [
  {
    id: "northstar-quote-demo",
    provider: "Northstar Moving — Demo",
    total: 1150,
    currency: "QAR",
    availability: "Available",
    disassembly: "Included",
    reassembly: "Included",
    insurance: "Included",
    packing: "Not included",
    missingFields: [],
    inclusions: ["Moving crew", "Transport", "Furniture disassembly"],
    exclusions: [],
    originalReply:
      "Demo reply: We can offer the move for QAR 1,150. Disassembly and reassembly are included, with insurance.",
  },
  {
    id: "harbor-quote-demo",
    provider: "Harbor & Home — Demo",
    total: 980,
    currency: "QAR",
    availability: "Available",
    disassembly: "Included",
    reassembly: "Included",
    insurance: "Not stated",
    packing: "Not included",
    missingFields: ["insurance"],
    inclusions: [
      "Moving crew",
      "Transport",
      "Furniture disassembly",
      "Furniture reassembly",
    ],
    exclusions: [],
    originalReply:
      "Demo reply: We are available and can complete the move for QAR 980, including disassembly and reassembly.",
  },
  {
    id: "blue-route-quote-demo",
    provider: "Blue Route Logistics — Demo",
    total: 920,
    currency: "QAR",
    availability: "Needs confirmation",
    disassembly: "Included",
    reassembly: "Not stated",
    insurance: "Not stated",
    packing: "Not included",
    missingFields: ["reassembly", "insurance"],
    inclusions: ["Moving crew", "Transport", "Furniture disassembly"],
    exclusions: [],
    originalReply:
      "Demo reply: Price is QAR 920. Availability needs confirmation. Disassembly is included.",
  },
];
type ProviderCard = {
  id: string;
  name: string;
  score: number;
  summary: string;
  reasons: string[];
  concerns: string[];
  status: string;
  source?: string;
  canContact: boolean;
};
type QuoteCard = {
  id: string;
  provider: string;
  total?: number;
  currency: string;
  availability: string;
  packing: string;
  disassembly: string;
  reassembly: string;
  insurance: string;
  missingFields: string[];
  inclusions: string[];
  exclusions: string[];
  originalReply: string;
  negotiationStatus?: string;
};
type MandateDraft = {
  targetTotal: string;
  maxBudget: string;
  maxRounds: string;
  maxMessagesPerProvider: string;
  followupHours: string;
  satisfactionThreshold: string;
};

export function NegotiatorApp() {
  const [view, setView] = useState<View>("landing");
  const [request, setRequest] = useState(initialRequest);
  const [demo, setDemo] = useState(false);
  const [missionId, setMissionId] = useState<Id<"missions"> | null>(null);
  const [notice, setNotice] = useState("");
  const seedDemo = useMutation(api.demo.seed);
  const createMission = useMutation(api.missions.create);
  const discover = useAction(api.research.discover);
  async function openDemo() {
    setNotice("");
    try {
      const id = await seedDemo();
      setMissionId(id);
      setDemo(true);
      setView("mission");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load the demo.",
      );
    }
  }
  async function confirm(draft: MovingDraft) {
    setNotice("");
    try {
      const id = await createMission({
        rawRequest: request,
        title: draft.title,
        requirements: {
          origin: draft.origin,
          destination: draft.destination,
          requestedDate: draft.requestedDate,
          propertySize: draft.propertySize,
          bedrooms: draft.bedrooms,
          packingRequired: draft.packingRequired,
          disassemblyRequired: draft.disassemblyRequired,
          reassemblyRequired: draft.reassemblyRequired,
          specialItems: draft.specialItems,
          elevatorAvailability: draft.elevatorAvailability,
          budget: draft.budget,
          notes: draft.notes,
        },
      });
      setMissionId(id);
      setDemo(false);
      setView("mission");
      void discover({ missionId: id }).catch((error) =>
        setNotice(
          error instanceof Error ? error.message : "Research could not start.",
        ),
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not create the mission.",
      );
    }
  }
  if (view === "landing")
    return (
      <>
        <Landing
          request={request}
          setRequest={setRequest}
          onStart={() => {
            setDemo(false);
            setView("requirements");
          }}
          onDemo={openDemo}
        />
        {notice && <div className="global-notice">{notice}</div>}
      </>
    );
  return (
    <div className="app-shell">
      <Topbar onHome={() => setView("landing")} demo={demo} />
      {notice && <div className="global-notice">{notice}</div>}
      {view === "requirements" ? (
        <Requirements
          rawRequest={request}
          onBack={() => setView("landing")}
          onConfirm={confirm}
        />
      ) : missionId ? (
        <MissionWorkspace demo={demo} missionId={missionId} />
      ) : null}
    </div>
  );
}

function Landing({
  request,
  setRequest,
  onStart,
  onDemo,
}: {
  request: string;
  setRequest: (value: string) => void;
  onStart: () => void;
  onDemo: () => void;
}) {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Brand />
        <div className="landing-actions">
          <AuthPanel />
          <Button variant="ghost" className="demo-link" onClick={onDemo}>
            <Sparkles size={15} /> Try demo mission
          </Button>
        </div>
      </nav>
      <section className="landing-hero">
        <div className="trust-line">
          <ShieldCheck size={16} /> You approve every provider contact
        </div>
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Your procurement command center</p>
            <h1>Better quotes. Less chasing.</h1>
            <p>
              Negotiator turns one plain-English request into a researched,
              approval-first buying workflow.
            </p>
            <div className="hero-proof">
              <span><CheckCircle2 size={14} /> Research-backed</span>
              <span><CheckCircle2 size={14} /> Human approved</span>
              <span><CheckCircle2 size={14} /> No hidden booking</span>
            </div>
          </div>
          <div className="hero-signal" aria-label="Negotiation workflow preview">
            <div className="signal-header"><span className="signal-dot" /> Mission live <span>•••</span></div>
            <div className="signal-title">Doha apartment move</div>
            <div className="signal-route"><MapPin size={14} /> West Bay <ChevronRight size={14} /> Lusail</div>
            <div className="signal-divider" />
            <div className="signal-row"><span>Providers researched</span><strong>05</strong></div>
            <div className="signal-row"><span>Approval gate</span><strong className="signal-green">Ready</strong></div>
            <div className="signal-next"><ShieldCheck size={16} /><span><b>Your call</b><small>Nothing is sent without your approval.</small></span></div>
          </div>
        </div>
        <p>
          Tell Negotiator what you need. It finds providers, contacts them,
          follows up, and brings you comparable offers.
        </p>
        <div className="mission-composer">
          <Label htmlFor="mission-request">What do you need?</Label>
          <Textarea
            id="mission-request"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            rows={5}
            placeholder="I need movers in Doha next Saturday for a 2-bedroom apartment."
          />
          <div className="composer-footer">
            <span>Start with moving services. More categories are coming.</span>
            <Button onClick={onStart} disabled={!request.trim()}>
              Start a mission <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </section>
      <section className="how-it-works" aria-label="How Negotiator works">
        <Feature
          icon={<Search size={20} />}
          title="Finds the right providers"
          description="Research is linked to visible sources."
        />
        <Feature
          icon={<Mail size={20} />}
          title="Contacts only with approval"
          description="No outreach happens until you choose."
        />
        <Feature
          icon={<Inbox size={20} />}
          title="Turns replies into offers"
          description="Quotes update in one comparable view."
        />
      </section>
    </main>
  );
}

function Requirements({
  rawRequest,
  onBack,
  onConfirm,
}: {
  rawRequest: string;
  onBack: () => void;
  onConfirm: (draft: MovingDraft) => void;
}) {
  const [draft, setDraft] = useState(() => parseMovingRequest(rawRequest));
  const update = <K extends keyof MovingDraft>(key: K, value: MovingDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const missing = [
    !draft.origin && "origin",
    !draft.destination && "destination",
    !draft.requestedDate && "requested date",
    !draft.propertySize && "property size",
  ].filter(Boolean);
  return (
    <main className="requirements-page">
      <button className="back-link" onClick={onBack}>
        ← Back to request
      </button>
      <div className="requirements-heading">
        <span className="status-dot" />
        <div>
          <p>Mission requirements</p>
          <h1>Here’s what Negotiator understood.</h1>
        </div>
      </div>
      <blockquote>{rawRequest}</blockquote>
      <div className="requirements-grid">
        <Field
          label="Mission title"
          value={draft.title}
          onChange={(value) => update("title", value)}
        />
        <Field
          label="Requested date"
          value={draft.requestedDate}
          onChange={(value) => update("requestedDate", value)}
        />
        <Field
          label="Origin"
          value={draft.origin}
          onChange={(value) => update("origin", value)}
        />
        <Field
          label="Destination"
          value={draft.destination}
          onChange={(value) => update("destination", value)}
        />
        <Field
          label="Property"
          value={draft.propertySize}
          onChange={(value) => update("propertySize", value)}
        />
        <Field label="Target quotes" value="3" />
      </div>
      <section className="service-options">
        <h2>Services</h2>
        <div>
          <Option
            checked={draft.disassemblyRequired === true}
            label="Furniture disassembly"
            onChange={(checked) => update("disassemblyRequired", checked)}
          />
          <Option
            checked={draft.reassemblyRequired === true}
            label="Furniture reassembly"
            onChange={(checked) => update("reassemblyRequired", checked)}
          />
          <Option
            checked={draft.packingRequired === true}
            label="Packing"
            onChange={(checked) => update("packingRequired", checked)}
          />
        </div>
      </section>
      <div className="requirements-note">
        <CheckCircle2 size={18} />
        <div>
          <strong>
            {missing.length ? "Review needed" : "Ready to research"}
          </strong>
          <span>
            {missing.length
              ? `Complete: ${missing.join(", ")}. Uncertain fields are never guessed.`
              : "Obvious fields were parsed locally. Confirm them before research begins."}
          </span>
        </div>
      </div>
      <div className="requirements-actions">
        <span>You’ll review providers before anyone is contacted.</span>
        <Button onClick={() => onConfirm(draft)} disabled={missing.length > 0}>
          Find providers <ArrowRight size={16} />
        </Button>
      </div>
    </main>
  );
}

function MissionWorkspace({
  demo,
  missionId,
}: {
  demo: boolean;
  missionId: Id<"missions">;
}) {
  const dashboard = useQuery(api.missions.dashboard, { missionId });
  const approveOutreach = useMutation(api.outreach.approveAndSend);
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const providers =
    dashboard?.providers.map((row) => ({
      id: row.provider?._id ?? row.link.providerId,
      name: row.provider?.name ?? "Unknown provider",
      score: row.link.fitScore ?? 0,
      summary: row.provider?.summary ?? "",
      reasons: row.link.fitReasons,
      concerns: row.link.concerns,
      status: row.link.status,
      source: row.sources[0]?.url,
      canContact: Boolean(row.provider?.contactEmail),
    })) ?? demoProviders;
  const quotes =
    dashboard?.quotes.map((row) => ({
      id: row.quote._id,
      provider: row.provider?.name ?? "Unknown provider",
      total: row.quote.total,
      currency: row.quote.currency,
      availability: row.quote.availability,
      packing: humanize(row.quote.packing),
      disassembly: humanize(row.quote.disassembly),
      reassembly: humanize(row.quote.reassembly),
      insurance: humanize(row.quote.insurance),
      missingFields: row.quote.missingFields,
      inclusions: row.quote.inclusions,
      exclusions: row.quote.exclusions,
      originalReply: row.message?.bodyText ?? "Original reply unavailable",
      negotiationStatus: dashboard.negotiationRuns?.find(
        (run: { providerId: string }) => run.providerId === row.quote.providerId,
      )?.status,
    })) ?? demoQuotes;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(demo ? demoProviders.map((p) => p.id) : []),
  );
  const approved =
    demo ||
    [
      "contacting",
      "waiting_for_responses",
      "comparing",
      "ready_to_choose",
      "completed",
    ].includes(dashboard?.mission.status ?? "");
  const [tab, setTab] = useState<"overview" | "providers" | "quotes">(
    "overview",
  );
  const bestQuote = useMemo(() => {
    const known = quotes
      .map((quote) => quote.total)
      .filter((total): total is number => typeof total === "number");
    return known.length ? Math.min(...known) : 0;
  }, [quotes]);
  const events = dashboard?.events.map(
    (event) =>
      [
        new Date(event.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        event.title,
        event.description,
        "done",
      ] as string[],
  );
  if (!dashboard)
    return <main className="mission-loading">Loading live mission…</main>;
  async function contactSelected(mandate: MandateDraft) {
    setWorkspaceNotice("");
    try {
      const providerIds = [...selected] as Id<"providers">[];
      const numberOrUndefined = (value: string) =>
        value.trim() === "" ? undefined : Number(value);
      await approveOutreach({
        missionId,
        providerIds,
        idempotencyKey: crypto.randomUUID(),
        targetTotal: numberOrUndefined(mandate.targetTotal),
        maxBudget: numberOrUndefined(mandate.maxBudget),
        maxRounds: numberOrUndefined(mandate.maxRounds),
        maxMessagesPerProvider: numberOrUndefined(mandate.maxMessagesPerProvider),
        followupHours: numberOrUndefined(mandate.followupHours),
        satisfactionThreshold: numberOrUndefined(mandate.satisfactionThreshold),
      });
    } catch (error) {
      setWorkspaceNotice(
        error instanceof Error ? error.message : "Outreach could not be sent.",
      );
    }
  }
  return (
    <main className="mission-layout">
      <aside className="mission-rail">
        <div className="mission-identity">
          <div className="mission-icon">
            <Building2 size={18} />
          </div>
          <div>
            <span>{dashboard.mission.title}</span>
            <small>
              {dashboard.mission.requirements.origin} →{" "}
              {dashboard.mission.requirements.destination}
            </small>
          </div>
        </div>
        <nav>
          <RailButton
            active={tab === "overview"}
            onClick={() => setTab("overview")}
            icon={<Circle size={16} />}
          >
            Mission overview
          </RailButton>
          <RailButton
            active={tab === "providers"}
            onClick={() => setTab("providers")}
            icon={<Search size={16} />}
          >
            Provider shortlist
          </RailButton>
          <RailButton
            active={tab === "quotes"}
            onClick={() => setTab("quotes")}
            icon={<Inbox size={16} />}
          >
            Quote comparison
          </RailButton>
        </nav>
        <div className="rail-trust">
          <ShieldCheck size={17} />
          <p>
            <strong>You stay in control</strong>Negotiator cannot purchase or
            accept offers.
          </p>
        </div>
      </aside>
      <section className="mission-main">
        {workspaceNotice && (
          <div className="inline-notice">{workspaceNotice}</div>
        )}
        {demo && (
          <div className="demo-banner">
            <Sparkles size={15} /> Demo mission — providers, messages, and
            quotes below are fictional examples.
          </div>
        )}
        <header className="mission-header">
          <div>
            <p className="mission-kicker">Moving services · Doha</p>
            <h1>{dashboard.mission.title}</h1>
            <div className="mission-meta">
              <MapPin size={15} /> {dashboard.mission.requirements.origin} →{" "}
              {dashboard.mission.requirements.destination} <span />{" "}
              <Clock3 size={15} />{" "}
              {dashboard.mission.requirements.requestedDate}
            </div>
          </div>
          <div className="mission-state">
            <span className="pulse" />{" "}
            {approved ? "Comparing offers" : "Awaiting your approval"}
          </div>
        </header>
        <Progress approved={approved} />
        <Stats
          bestQuote={bestQuote}
          providers={providers.length}
          quotes={quotes.length}
        />
        {tab === "overview" && (
          <Overview
            approved={approved}
            events={events}
            onNavigate={setTab}
          />
        )}
        {tab === "providers" && (
          <Providers
            providers={providers}
            selected={selected}
            setSelected={setSelected}
            approved={approved}
            onApprove={contactSelected}
            defaultMandate={{
              targetTotal: dashboard.mission.requirements.budget?.toString() ?? "",
              maxBudget: dashboard.mission.requirements.budget?.toString() ?? "",
              maxRounds: dashboard.policy?.maxRounds?.toString() ?? "4",
              maxMessagesPerProvider:
                dashboard.policy?.maxMessagesPerProvider?.toString() ?? "5",
              followupHours: dashboard.policy?.followupHours?.toString() ?? "24",
              satisfactionThreshold:
                dashboard.policy?.satisfactionThreshold?.toString() ?? "0.8",
            }}
          />
        )}
        {tab === "quotes" && <Quotes quotes={quotes} demo={demo} />}
      </section>
    </main>
  );
}

function Overview({
  approved,
  events = [],
  onNavigate,
}: {
  approved: boolean;
  events?: string[][];
  onNavigate: (tab: "overview" | "providers" | "quotes") => void;
}) {
  return (
    <div className="overview-grid">
      <section className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <h2>Mission pulse</h2>
            <p>Every action, source, and decision in one place.</p>
          </div>
          <span className="live-chip">Live</span>
        </div>
        <div className="timeline">
          {events.map(([time, title, detail, state]) => (
            <div className="timeline-event" key={title}>
              <span className={`event-node ${state}`} />
              <time>{time}</time>
              <div>
                <strong>{title}</strong>
                <p>{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <aside className="panel next-action">
        <span className="action-icon">
          {approved ? <Inbox size={20} /> : <ShieldCheck size={20} />}
        </span>
        <p>Next action</p>
        <h2>{approved ? "Review the offers" : "Approve provider outreach"}</h2>
        <span>
          {approved
            ? "Three replies are ready for an apples-to-apples comparison."
            : "Choose which shortlisted businesses Negotiator may email."}
        </span>
          <Button
            variant="outline"
            onClick={() => onNavigate(approved ? "quotes" : "providers")}
          >
            {approved ? "Compare quotes" : "Review shortlist"} <ArrowRight size={15} />
          </Button>
      </aside>
    </div>
  );
}

function Providers({
  providers,
  selected,
  setSelected,
  approved,
  onApprove,
  defaultMandate,
}: {
  providers: ProviderCard[];
  selected: Set<string>;
  setSelected: (value: Set<string>) => void;
  approved: boolean;
  onApprove: (mandate: MandateDraft) => Promise<void>;
  defaultMandate: MandateDraft;
}) {
  const [mandate, setMandate] = useState(defaultMandate);
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<"fit" | "name">("fit");
  const updateMandate = (key: keyof MandateDraft, value: string) =>
    setMandate((current) => ({ ...current, [key]: value }));
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  const visibleProviders = providers
    .filter((provider) =>
      `${provider.name} ${provider.summary}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
    )
    .sort((a, b) => (sort === "fit" ? b.score - a.score : a.name.localeCompare(b.name)));
  return (
    <section className="providers-view">
      <SectionHeading
        title="Provider shortlist"
        description="Research-backed matches. Open a source before approving outreach."
        meta={`${selected.size} selected`}
      />
      {!approved && (
        <div className="mandate-panel panel">
          <div className="panel-heading">
            <div>
              <h2>Negotiation mandate</h2>
              <p>Set the limits Negotiator must follow after your one approval.</p>
            </div>
            <span className="live-chip">Your rules</span>
          </div>
          <div className="mandate-grid">
            <MandateInput
              label="Target total (QAR)"
              value={mandate.targetTotal}
              onChange={(value) => updateMandate("targetTotal", value)}
              placeholder="Optional"
              min="0"
              max="10000000"
            />
            <MandateInput
              label="Maximum budget (QAR)"
              value={mandate.maxBudget}
              onChange={(value) => updateMandate("maxBudget", value)}
              placeholder="Optional"
              min="0"
              max="10000000"
            />
            <MandateInput
              label="Max rounds"
              value={mandate.maxRounds}
              onChange={(value) => updateMandate("maxRounds", value)}
              min="1"
              max="8"
            />
            <MandateInput
              label="Max messages / provider"
              value={mandate.maxMessagesPerProvider}
              onChange={(value) => updateMandate("maxMessagesPerProvider", value)}
              min="1"
              max="10"
            />
            <MandateInput
              label="Follow up after (hours)"
              value={mandate.followupHours}
              onChange={(value) => updateMandate("followupHours", value)}
              min="1"
              max="168"
            />
            <MandateInput
              label="Satisfaction threshold"
              value={mandate.satisfactionThreshold}
              onChange={(value) => updateMandate("satisfactionThreshold", value)}
              min="0.5"
              max="1"
              step="0.1"
            />
          </div>
          <small className="mandate-help">
            The workflow stops at these limits, never books, and never pays. Blank budgets mean the quote must still be complete and available.
          </small>
        </div>
      )}
      <div className="provider-toolbar">
        <label className="search-control">
          <Search size={15} />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search shortlist"
            aria-label="Search provider shortlist"
          />
        </label>
        <label className="sort-control">
          <SlidersHorizontal size={14} />
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as "fit" | "name")} aria-label="Sort providers">
            <option value="fit">Best fit</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <div className="provider-list">
        {visibleProviders.map((provider) => (
          <article
            className={`provider-card ${selected.has(provider.id) ? "selected" : ""}`}
            key={provider.id}
          >
            <button
              className="select-box"
              aria-label={`Select ${provider.name}`}
              onClick={() => toggle(provider.id)}
              disabled={!provider.canContact && !provider.id.includes("demo")}
            >
              {selected.has(provider.id) && <Check size={14} />}
            </button>
            <div className="provider-main">
              <div className="provider-title">
                <div>
                  <h3>{provider.name}</h3>
                  <span>{provider.summary}</span>
                </div>
                <strong>
                  {provider.score}
                  <small>/100 fit</small>
                </strong>
              </div>
              <div className="provider-evidence">
                <div className="score-breakdown">
                  {provider.reasons.map((reason) => (
                    <p key={reason}>
                      <CheckCircle2 size={15} /> {reason}
                    </p>
                  ))}
                </div>
                <div className="score-breakdown concerns">
                  {provider.concerns.map((concern) => (
                    <p className="concern" key={concern}>
                      <Circle size={13} /> {concern}
                    </p>
                  ))}
                </div>
              </div>
              <div className="provider-footer">
                <a href={provider.source} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} /> Source
                </a>
                <span className="status-badge">
                  {approved
                    ? provider.status
                    : provider.canContact
                      ? "Ready for approval"
                      : "Contact not verified"}
                </span>
              </div>
            </div>
          </article>
        ))}
        {!visibleProviders.length && (
          <div className="empty-state"><Search size={20} /><strong>No providers match</strong><span>Try a different search term.</span></div>
        )}
      </div>
      {!approved && (
        <div className="approval-bar">
          <div>
            <ShieldCheck size={18} />
            <p>
              <strong>Approval required</strong>
              <span>No email is sent until you confirm.</span>
            </p>
          </div>
          <Button onClick={() => void onApprove(mandate)} disabled={!selected.size}>
            Contact {selected.size} selected providers
          </Button>
        </div>
      )}
    </section>
  );
}

function MandateInput({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  step = "1",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label className="mandate-field">
      <span>{label}</span>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
      />
    </label>
  );
}

function Quotes({ quotes, demo }: { quotes: QuoteCard[]; demo: boolean }) {
  const labels = quoteLabels(quotes);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className="quotes-view">
      <SectionHeading
        title="Quote comparison"
        description="Unknown details stay unknown. Open a row to inspect the original reply."
        meta={`${quotes.length} replies`}
      />
      <div className="recommendation">
        <CheckCircle2 size={18} />
        <p>
          <strong>Transparent comparison only</strong>
          <span>
            Labels below are calculated from known price, confirmed inclusions,
            and missing fields. Negotiator does not choose for you.
          </span>
        </p>
      </div>
      <div className="quote-table-wrap">
        {!quotes.length && (
          <div className="empty-state quote-empty"><Inbox size={22} /><strong>Waiting for replies</strong><span>Approved providers will appear here as they respond.</span></div>
        )}
        <table className="quote-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Total</th>
              <th>Availability</th>
              <th>Disassembly</th>
              <th>Reassembly</th>
              <th>Insurance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote, index) => (
              <QuoteRow
                key={quote.id}
                quote={quote}
                labels={labels[index]}
                open={openId === quote.id}
                onToggle={() =>
                  setOpenId(openId === quote.id ? null : quote.id)
                }
                demo={demo}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function QuoteRow({
  quote,
  labels,
  open,
  onToggle,
  demo,
}: {
  quote: QuoteCard;
  labels: string[];
  open: boolean;
  onToggle: () => void;
  demo: boolean;
}) {
  const correctQuote = useMutation(api.quotes.correct);
  const acceptQuote = useMutation(api.negotiation.acceptQuote);
  const [total, setTotal] = useState(quote.total?.toString() ?? "");
  const [availability, setAvailability] = useState(quote.availability);
  const [packing, setPacking] = useState<TriState>(toTriState(quote.packing));
  const [disassembly, setDisassembly] = useState<TriState>(
    toTriState(quote.disassembly),
  );
  const [reassembly, setReassembly] = useState<TriState>(
    toTriState(quote.reassembly),
  );
  const [insurance, setInsurance] = useState<TriState>(
    toTriState(quote.insurance),
  );
  const [inclusions, setInclusions] = useState(quote.inclusions.join("\n"));
  const [exclusions, setExclusions] = useState(quote.exclusions.join("\n"));
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState("");
  async function save() {
    setSaved("");
    try {
      await correctQuote({
        quoteId: quote.id as Id<"quotes">,
        currency: quote.currency,
        total: total ? Number(total) : undefined,
        availability,
        packing,
        disassembly,
        reassembly,
        insurance,
        inclusions: inclusions.split("\n"),
        exclusions: exclusions.split("\n"),
        note,
      });
      setSaved("Correction saved");
    } catch (error) {
      setSaved(
        error instanceof Error ? error.message : "Could not save correction",
      );
    }
  }
  async function accept() {
    setSaved("");
    try {
      await acceptQuote({ quoteId: quote.id as Id<"quotes"> });
      setSaved("Quote selected. No booking or payment was made.");
    } catch (error) {
      setSaved(error instanceof Error ? error.message : "Could not select quote");
    }
  }
  return (
    <>
      <tr>
        <td data-label="Provider">
          <strong>{quote.provider}</strong>
          <div className="quote-labels">
            {labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </td>
        <td data-label="Total">
          <strong>
            {quote.total === undefined
              ? "Not stated"
              : `${quote.currency} ${quote.total.toLocaleString()}`}
          </strong>
        </td>
        <td data-label="Availability">{quote.availability}</td>
        <td data-label="Disassembly">{quote.disassembly}</td>
        <td data-label="Reassembly">{quote.reassembly}</td>
        <td data-label="Insurance" className={quote.insurance === "Not stated" ? "unknown" : ""}>
          {quote.insurance}
        </td>
        <td data-label="Details">
          <button
            aria-label={`Open ${quote.provider} quote`}
            onClick={onToggle}
          >
            <ChevronDown size={16} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="quote-detail">
          <td colSpan={7}>
            <div className="original-reply">
              <strong>Original provider reply</strong>
              <pre>{quote.originalReply}</pre>
            </div>
            <div className="quote-review">
              <label>
                Total
                <input
                  value={total}
                  inputMode="decimal"
                  onChange={(event) => setTotal(event.target.value)}
                />
              </label>
              <label>
                Availability
                <input
                  value={availability}
                  onChange={(event) => setAvailability(event.target.value)}
                />
              </label>
              <TriStateEditor
                label="Packing"
                value={packing}
                onChange={setPacking}
              />
              <TriStateEditor
                label="Disassembly"
                value={disassembly}
                onChange={setDisassembly}
              />
              <TriStateEditor
                label="Reassembly"
                value={reassembly}
                onChange={setReassembly}
              />
              <TriStateEditor
                label="Insurance"
                value={insurance}
                onChange={setInsurance}
              />
              <label>
                Confirmed inclusions
                <textarea
                  value={inclusions}
                  onChange={(event) => setInclusions(event.target.value)}
                />
              </label>
              <label>
                Explicit exclusions
                <textarea
                  value={exclusions}
                  onChange={(event) => setExclusions(event.target.value)}
                />
              </label>
              <label>
                Correction note
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What did you correct?"
                />
              </label>
              <Button variant="outline" onClick={save} disabled={demo}>
                {demo ? "Demo is read-only" : "Save correction"}
              </Button>
              {saved && <span>{saved}</span>}
            </div>
            <p className="missing-summary">
              Unknown:{" "}
              {quote.missingFields.length
                ? quote.missingFields.join(", ")
                : "none"}
            </p>
            {quote.negotiationStatus && (
              <p className="missing-summary">
                Negotiation: {humanize(quote.negotiationStatus)}
              </p>
            )}
            {quote.negotiationStatus === "ready_for_user" && !demo && (
              <Button onClick={accept}>Select this satisfactory quote</Button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function TriStateEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriState;
  onChange: (value: TriState) => void;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TriState)}
      >
        <option value="included">Included</option>
        <option value="not_included">Not included</option>
        <option value="not_stated">Not stated</option>
        <option value="needs_clarification">Needs clarification</option>
      </select>
    </label>
  );
}

function Topbar({ onHome, demo }: { onHome: () => void; demo: boolean }) {
  return (
    <header className="topbar">
      <button onClick={onHome}>
        <Brand />
      </button>
      <div>
        <span className="integration-dot" />{" "}
        {demo ? "Demo workspace" : "Mission workspace"}
        <span className="avatar">AK</span>
      </div>
    </header>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span>N</span>
      <strong>Negotiator</strong>
    </div>
  );
}
function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article>
      {icon}
      <h2>{title}</h2>
      <p>{description}</p>
    </article>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="field">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={!onChange}
      />
    </div>
  );
}
function Option({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="option">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function RailButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
function SectionHeading({
  title,
  description,
  meta,
}: {
  title: string;
  description: string;
  meta: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span>{meta}</span>
    </div>
  );
}
function Progress({ approved }: { approved: boolean }) {
  const steps = [
    "Requirements",
    "Research",
    "Shortlist",
    "Contact",
    "Replies",
    "Compare",
  ];
  return (
    <div className="progress-track">
      {steps.map((step, index) => (
        <div
          className={
            index < (approved ? 6 : 3)
              ? "complete"
              : index === 3
                ? "current"
                : ""
          }
          key={step}
        >
          <span>
            {index < (approved ? 6 : 3) ? <Check size={12} /> : index + 1}
          </span>
          <small>{step}</small>
        </div>
      ))}
    </div>
  );
}
function Stats({
  bestQuote,
  providers,
  quotes,
}: {
  bestQuote: number;
  providers: number;
  quotes: number;
}) {
  const stats = [
    ["Providers found", String(providers)],
    ["Shortlisted", String(providers)],
    ["Contacted", String(quotes)],
    ["Replied", String(quotes)],
    ["Best quote", bestQuote ? `QAR ${bestQuote}` : "—"],
  ];
  return (
    <div className="stats-grid">
      {stats.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
function humanize(value: string) {
  return value
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}
function toTriState(value: string): TriState {
  const normalized = value.toLowerCase().replaceAll(" ", "_");
  return normalized === "included" ||
    normalized === "not_included" ||
    normalized === "needs_clarification"
    ? normalized
    : "not_stated";
}
