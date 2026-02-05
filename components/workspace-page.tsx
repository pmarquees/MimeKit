"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DitherText } from "@/components/dither-text";
import { techRegistry } from "@/lib/data/tech-registry";
import { IntentSpec, RunResult, StackCategory, TargetAgent } from "@/lib/models";

type Props = {
  runId: string;
};

type NodeLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const STACK_ORDER: StackCategory[] = ["frontend", "backend", "db", "auth", "infra", "language"];
const CARD_BACKGROUNDS = ["card-bg-2", "card-bg-3", "card-bg-4", "card-bg-5", "card-bg-1"];
const STACK_DITHER_SOURCE = "REWRITING STACK MAP";

function titleForCategory(category: StackCategory): string {
  switch (category) {
    case "frontend":
      return "Presentation";
    case "backend":
      return "Server Runtime";
    case "db":
      return "Persistence";
    case "auth":
      return "Access Control";
    case "infra":
      return "Infrastructure";
    case "language":
      return "Language";
  }
}

function roleForCategory(category: StackCategory): string {
  switch (category) {
    case "frontend":
      return "Frontend";
    case "backend":
      return "Backend";
    case "db":
      return "Database";
    case "auth":
      return "Auth";
    case "infra":
      return "Infra";
    case "language":
      return "Language";
  }
}

function sectionToText(value: string | string[]): string {
  return Array.isArray(value) ? value.join("\n") : value;
}

function textToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function layoutFor(index: number): NodeLayout {
  const presets: NodeLayout[] = [
    { x: 80, y: 40, width: 140, height: 88 },
    { x: 80, y: 180, width: 140, height: 88 },
    { x: 20, y: 300, width: 140, height: 88 },
    { x: 170, y: 300, width: 140, height: 88 },
    { x: 20, y: 430, width: 140, height: 88 },
    { x: 170, y: 430, width: 140, height: 88 }
  ];

  return presets[index] ?? { x: 20 + (index % 2) * 150, y: 560 + Math.floor(index / 2) * 130, width: 140, height: 88 };
}

function pathBetween(from: NodeLayout, to: NodeLayout): string {
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height;
  const x2 = to.x + to.width / 2;
  const y2 = to.y;
  const controlY = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${controlY} ${x2},${controlY} ${x2},${y2}`;
}

function intentSectionEntries(intent: IntentSpec): Array<{ key: string; label: string; value: string | string[] }> {
  return [
    { key: "system_purpose", label: "01 / Purpose", value: intent.system_purpose },
    { key: "core_features", label: "02 / Core Features", value: intent.core_features },
    { key: "user_flows", label: "03 / Key Flows", value: intent.user_flows },
    { key: "data_contracts", label: "04 / Data Contracts", value: intent.data_contracts },
    { key: "business_rules", label: "05 / Business Rules", value: intent.business_rules },
    { key: "invariants", label: "06 / Constraints", value: intent.invariants }
  ];
}

const DEFAULT_ALTERNATIVES: Record<StackCategory, string[]> = {
  frontend: ["Remix", "Nuxt", "SvelteKit"],
  backend: ["FastAPI", "Fastify", "NestJS"],
  db: ["PostgreSQL", "MySQL", "DynamoDB"],
  auth: ["Auth0", "Clerk", "Supabase Auth"],
  infra: ["Vercel Functions", "Cloud Run", "Kubernetes"],
  language: ["TypeScript", "Python", "Go"]
};

export function WorkspacePage({ runId }: Props): React.ReactElement {
  const [run, setRun] = useState<RunResult | null>(null);
  const [intentDraft, setIntentDraft] = useState<IntentSpec | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState<Record<string, boolean>>({});
  const [swapPick, setSwapPick] = useState<Record<string, string>>({});
  const [targetAgent, setTargetAgent] = useState<TargetAgent>("claude-code");
  const [correctedAssumptions, setCorrectedAssumptions] = useState<Record<string, boolean>>({});
  const [correctedUnknowns, setCorrectedUnknowns] = useState<Record<string, boolean>>({});
  const [correctedLowConfidence, setCorrectedLowConfidence] = useState<Record<string, boolean>>({});
  const [stackSwapLoading, setStackSwapLoading] = useState(false);
  const [graphModalOpen, setGraphModalOpen] = useState(false);
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [planSheetBusy, setPlanSheetBusy] = useState(false);
  const [planSheetNotice, setPlanSheetNotice] = useState<string | null>(null);

  useEffect(() => {
    async function loadRun(): Promise<void> {
      const response = await fetch(`/api/runs/${runId}`);
      const json = (await response.json()) as RunResult | { error: string };
      if (!response.ok || "error" in json) {
        setError("Unable to load run. Analyze a repository first.");
        return;
      }

      setRun(json);
      setIntentDraft(json.intent);
      setTargetAgent(json.plan.targetAgent);
    }

    void loadRun();
  }, [runId]);

  const selectedComponent = useMemo(() => {
    if (!run || !selectedComponentId) return run?.architecture.components[0] ?? null;
    return run.architecture.components.find((component) => component.id === selectedComponentId) ?? null;
  }, [run, selectedComponentId]);

  const positioned = useMemo(() => {
    if (!run) return [];
    return run.architecture.components.map((component, index) => ({
      component,
      layout: layoutFor(index)
    }));
  }, [run]);

  const layoutMap = useMemo(() => {
    const map = new Map<string, NodeLayout>();
    for (const item of positioned) {
      map.set(item.component.id, item.layout);
    }
    return map;
  }, [positioned]);

  async function recompile(nextIntent: IntentSpec): Promise<void> {
    setBusyLabel("Recompiling plan");
    setError(null);

    const response = await fetch("/api/recompile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        targetAgent,
        intent: nextIntent
      })
    });

    const json = (await response.json()) as RunResult | { error: string };
    if (!response.ok || "error" in json) {
      throw new Error("error" in json ? json.error : "Failed to recompile");
    }

    setRun(json);
    setIntentDraft(json.intent);
  }

  async function onSwap(category: StackCategory, current: string): Promise<void> {
    const key = `${category}:${current}`;
    const replacement = swapPick[key];
    if (!replacement) return;

    setBusyLabel(`Swapping ${current}`);
    setStackSwapLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stack-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          category,
          current,
          replacement,
          targetAgent
        })
      });

      const json = (await response.json()) as RunResult | { error: string };
      if (!response.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Stack swap failed");
      }

      setRun(json);
      setIntentDraft(json.intent);
      setSwapOpen((prev) => ({ ...prev, [key]: false }));
    } catch (swapError) {
      setError(swapError instanceof Error ? swapError.message : "Failed to swap stack");
    } finally {
      setStackSwapLoading(false);
      setBusyLabel(null);
    }
  }

  function updateIntentField(field: keyof IntentSpec, value: string): void {
    if (!intentDraft) return;

    const next = structuredClone(intentDraft);

    if (field === "system_purpose") {
      next.system_purpose = value;
    } else if (field === "core_features") {
      next.core_features = textToList(value);
    } else if (field === "user_flows") {
      next.user_flows = textToList(value);
    } else if (field === "business_rules") {
      next.business_rules = textToList(value);
    } else if (field === "data_contracts") {
      next.data_contracts = textToList(value);
    } else if (field === "invariants") {
      next.invariants = textToList(value);
    }

    setIntentDraft(next);
  }

  async function onCompileIntent(): Promise<void> {
    if (!intentDraft) return;
    try {
      await recompile(intentDraft);
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : "Recompile failed");
    } finally {
      setBusyLabel(null);
    }
  }

  async function onRecomputeCorrections(): Promise<void> {
    if (!intentDraft) return;

    const next = structuredClone(intentDraft);
    next.assumptions = next.assumptions.filter((item) => !correctedAssumptions[item]);
    next.unknowns = next.unknowns.filter((item) => !correctedUnknowns[item]);

    try {
      await recompile(next);
    } catch (recomputeError) {
      setError(recomputeError instanceof Error ? recomputeError.message : "Recompute failed");
    } finally {
      setBusyLabel(null);
    }
  }

  async function onCopyPlan(): Promise<void> {
    if (!run) return;
    await navigator.clipboard.writeText(run.plan.prompt);
    setPlanSheetNotice("Plan copied to clipboard.");
  }

  function onDownloadPlan(): void {
    if (!run) return;
    const blob = new Blob([run.plan.prompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mimickit-plan-${runId}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setPlanSheetNotice("Plan downloaded.");
  }

  async function onRegeneratePlanFromSheet(): Promise<void> {
    if (!intentDraft) return;
    setPlanSheetBusy(true);
    setPlanSheetNotice(null);
    try {
      await recompile(intentDraft);
      setPlanSheetNotice("Plan regenerated.");
    } catch (sheetError) {
      setError(sheetError instanceof Error ? sheetError.message : "Plan regeneration failed");
    } finally {
      setPlanSheetBusy(false);
      setBusyLabel(null);
    }
  }

  if (error && !run) {
    return (
      <main className="intake-shell">
        <section className="intake-card">
          <h1 className="intake-title">Workspace</h1>
          <p className="error-text">{error}</p>
          <Link href="/" className="text-link">
            Back to intake
          </Link>
        </section>
      </main>
    );
  }

  if (!run || !intentDraft) {
    return (
      <main className="intake-shell">
        <section className="intake-card">
          <h1 className="intake-title">
            <DitherText source="LOADING WORKSPACE" />
          </h1>
        </section>
      </main>
    );
  }

  const renderGraphCanvas = (isExpanded = false): React.ReactElement => (
    <div className={`graph-canvas ${isExpanded ? "graph-canvas-expanded" : ""}`}>
      <svg className="connector">
        {run.architecture.edges.map((edge, index) => {
          const from = layoutMap.get(edge.from);
          const to = layoutMap.get(edge.to);
          if (!from || !to) return null;

          return <path key={`${edge.from}-${edge.to}-${index}`} d={pathBetween(from, to)} />;
        })}
      </svg>

      {positioned.map(({ component, layout }, index) => (
        <button
          key={component.id}
          className={`node node-button ${selectedComponent?.id === component.id ? "node-selected" : ""}`}
          style={{
            top: layout.y,
            left: layout.x,
            background: index % 2 === 1 ? "var(--bg-hakuji)" : "#fff"
          }}
          onClick={() => setSelectedComponentId(component.id)}
        >
          <div className="jp-text">{component.role.toUpperCase()}</div>
          <div className="node-label u-caps">{component.role.split(" ")[0]}</div>
          <div className="node-value">{component.name}</div>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="layout-container">
        <header className="app-header">
        <div className="header-brand">
          <div className="u-caps u-bold">MimicKit UI</div>
          <div className="u-caps u-muted">[Blueprint Tool]</div>
          <div className="u-caps u-faint">v.1.0.2 / 2026</div>
        </div>

        <div className="header-controls u-col u-j-sb">
          <div className="u-caps u-bold u-muted" style={{ marginBottom: 8 }}>
            Repo Intake
          </div>
          <input
            type="text"
            className="url-input"
            value={run.snapshot.repo.url}
            readOnly
            aria-label="Repository URL"
          />
        </div>

        <div className="header-actions header-action-cluster">
          <select
            className="select-input compact"
            value={targetAgent}
            onChange={(event) => setTargetAgent(event.target.value as TargetAgent)}
            aria-label="Target agent"
          >
            <option value="claude-code">Claude Code</option>
            <option value="codex">Codex</option>
            <option value="generic">Generic</option>
          </select>

          <button className="btn-compile" onClick={() => void onCompileIntent()} disabled={!!busyLabel}>
            <span className={`status-dot ${busyLabel ? "active" : ""}`} />
            {busyLabel ? <DitherText source={busyLabel.toUpperCase()} /> : "Compile Intent"}
          </button>

          <button className="btn-compile ghost-link" onClick={() => setPlanSheetOpen(true)}>
            Open Plan
          </button>
        </div>
      </header>

      <aside className="panel-left">
        <div className="u-pad u-border-b panel-head-row spread">
          <span className="u-caps u-bold u-muted">System Graph</span>
          <button className="mini-btn mini-btn-tight" onClick={() => setGraphModalOpen(true)}>
            Expand
          </button>
        </div>

        {renderGraphCanvas()}

        <div className="node-inspector u-border-b">
          <div className="u-caps u-muted">Node details</div>
          {selectedComponent ? (
            <>
              <p className="inspector-title">{selectedComponent.name}</p>
              <p className="inspector-line">Role: {selectedComponent.role}</p>
              <p className="inspector-line">Tech: {selectedComponent.tech.join(", ")}</p>
              <p className="inspector-line">Inputs: {selectedComponent.inputs.join(", ")}</p>
              <p className="inspector-line">Outputs: {selectedComponent.outputs.join(", ")}</p>
            </>
          ) : null}
        </div>
      </aside>

      <main className="panel-center">
        <div className="u-pad u-border-b panel-head-row spread">
          <span className="u-caps u-bold u-muted">Behavior Specs</span>
          <span className="u-caps u-faint">Editable</span>
        </div>

        {intentSectionEntries(intentDraft).map((section, index) => {
          const confidenceValue = intentDraft.confidenceBySection[section.key] ?? 0.65;
          const pct = Math.round(confidenceValue * 100);
          return (
            <div className={`intent-block ${index % 2 === 1 ? "intent-alt" : ""}`} key={section.key}>
              <div className="intent-header u-caps u-bold">
                <span className="u-muted">{section.label}</span>
              </div>
              <textarea
                className="intent-input"
                value={sectionToText(section.value)}
                onChange={(event) => updateIntentField(section.key as keyof IntentSpec, event.target.value)}
              />
              <div className="confidence-meter">
                <span>CONFIDENCE</span>
                <div className="meter-bar">
                  <div className="meter-fill" style={{ width: `${pct}%` }} />
                </div>
                <span>{pct >= 75 ? "HIGH" : pct >= 50 ? "MED" : "LOW"}</span>
              </div>
            </div>
          );
        })}

        <section className="confidence-panel">
          <div className="u-caps u-bold u-muted">Confidence Panel</div>
          <p className="u-muted">Mark corrected assumptions/unknowns/low confidence detections, then recompute.</p>

          <div className="confidence-columns">
            <div>
              <p className="u-caps u-faint">Assumptions</p>
              {intentDraft.assumptions.map((item) => (
                <label key={item} className="check-row">
                  <input
                    type="checkbox"
                    checked={!!correctedAssumptions[item]}
                    onChange={(event) =>
                      setCorrectedAssumptions((prev) => ({ ...prev, [item]: event.target.checked }))
                    }
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>

            <div>
              <p className="u-caps u-faint">Unknowns</p>
              {intentDraft.unknowns.map((item) => (
                <label key={item} className="check-row">
                  <input
                    type="checkbox"
                    checked={!!correctedUnknowns[item]}
                    onChange={(event) =>
                      setCorrectedUnknowns((prev) => ({ ...prev, [item]: event.target.checked }))
                    }
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>

            <div>
              <p className="u-caps u-faint">Low Confidence</p>
              {run.stack.lowConfidenceFindings.map((item) => (
                <label key={item} className="check-row">
                  <input
                    type="checkbox"
                    checked={!!correctedLowConfidence[item]}
                    onChange={(event) =>
                      setCorrectedLowConfidence((prev) => ({ ...prev, [item]: event.target.checked }))
                    }
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>

          <button className="btn-compile" onClick={() => void onRecomputeCorrections()} disabled={!!busyLabel}>
            {busyLabel ? <DitherText source={busyLabel.toUpperCase()} /> : "Recompute With Corrections"}
          </button>
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      </main>

      <aside className={`panel-right ${stackSwapLoading ? "panel-right-loading" : ""}`}>
        <div className="u-pad u-border-b panel-head-row spread">
          <span className="u-caps u-bold u-muted">Stack Map</span>
          {stackSwapLoading ? (
            <span className="stack-map-status">
              <DitherText source="TRANSFORMING" />
            </span>
          ) : null}
        </div>

        {stackSwapLoading ? (
          <div className="stack-loading-overlay" role="status" aria-live="polite">
            <div className="stack-loading-chip">
              <div className="stack-loading-line">
                <span className="stack-loading-dot" />
                <DitherText source={STACK_DITHER_SOURCE} className="stack-loading-text" />
              </div>
              <span className="stack-loading-sub">Applying registry transforms and plan rewrite</span>
            </div>
          </div>
        ) : null}

        {STACK_ORDER.map((category, index) => {
          const item = run.stack[category][0];
          if (!item) return null;

          const key = `${category}:${item.name}`;
          const registry = techRegistry.entries.find((entry) => {
            const names = [entry.key, ...entry.alternatives].map((value) => value.toLowerCase());
            return names.includes(item.name.toLowerCase());
          });
          const alternatives = registry?.alternatives ?? DEFAULT_ALTERNATIVES[category];

          return (
            <div className={`stack-card ${CARD_BACKGROUNDS[index % CARD_BACKGROUNDS.length]}`} key={key}>
              <div className="card-header">
                <span className="jp-text">{titleForCategory(category).toUpperCase()}</span>
                <span className="card-role u-caps">{roleForCategory(category)}</span>
                <span className="card-tech">{item.name.toUpperCase()}</span>
              </div>

              <div className="card-meta">
                <span>CONF: {(item.confidence * 100).toFixed(0)}%</span>
                <span>{item.version ? `VER: ${item.version}` : "VER: n/a"}</span>
                <span>EVIDENCE: {item.evidence[0] ?? "signal detected"}</span>
              </div>

              <div className="stack-actions">
                <button
                  className="card-action visible"
                  disabled={stackSwapLoading}
                  onClick={() => setSwapOpen((prev) => ({ ...prev, [key]: !prev[key] }))}
                >
                  Replace Stack
                </button>

                {swapOpen[key] ? (
                  <div className="swap-row">
                    <select
                      className="select-input compact"
                      disabled={stackSwapLoading}
                      value={swapPick[key] ?? alternatives[0]}
                      onChange={(event) =>
                        setSwapPick((prev) => ({
                          ...prev,
                          [key]: event.target.value
                        }))
                      }
                    >
                      {alternatives.map((option) => (
                        <option value={option} key={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <button className="mini-btn" disabled={stackSwapLoading} onClick={() => void onSwap(category, item.name)}>
                      Apply
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </aside>
    </div>

      {graphModalOpen ? (
        <div className="graph-modal-root" role="dialog" aria-modal="true" aria-label="Expanded system graph">
          <button className="graph-modal-backdrop" onClick={() => setGraphModalOpen(false)} aria-label="Close graph modal" />
          <section className="graph-modal-panel">
            <div className="graph-modal-header">
              <span className="u-caps u-bold u-muted">System Graph Expanded</span>
              <button className="mini-btn" onClick={() => setGraphModalOpen(false)}>
                Close
              </button>
            </div>
            {renderGraphCanvas(true)}
          </section>
        </div>
      ) : null}

      {planSheetOpen ? (
        <div className="sheet-root" role="dialog" aria-modal="true" aria-label="Executable plan">
          <button className="sheet-backdrop" onClick={() => setPlanSheetOpen(false)} aria-label="Close plan sheet" />
          <section className="sheet-panel">
            <div className="sheet-handle" />
            <div className="sheet-header">
              <span className="u-caps u-bold u-muted">Executable Plan</span>
              <button className="mini-btn" onClick={() => setPlanSheetOpen(false)}>
                Close
              </button>
            </div>
            <div className="sheet-actions">
              <button className="btn-compile" disabled={planSheetBusy} onClick={() => void onRegeneratePlanFromSheet()}>
                {planSheetBusy ? <DitherText source="REGENERATING PLAN" /> : "Regenerate"}
              </button>
              <button className="btn-compile" onClick={() => void onCopyPlan()}>
                Copy
              </button>
              <button className="btn-compile" onClick={() => onDownloadPlan()}>
                Download
              </button>
              <Link href={`/plan/${runId}`} className="btn-compile ghost-link">
                Full Page
              </Link>
            </div>
            <pre className="sheet-plan">{run.plan.prompt}</pre>
            {planSheetNotice ? <p className="status-text">{planSheetNotice}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
