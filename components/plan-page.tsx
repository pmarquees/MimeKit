"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DitherText } from "@/components/dither-text";
import { RunResult, TargetAgent } from "@/lib/models";

type Props = {
  runId: string;
};

export function PlanPage({ runId }: Props): React.ReactElement {
  const [run, setRun] = useState<RunResult | null>(null);
  const [targetAgent, setTargetAgent] = useState<TargetAgent>("claude-code");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRun(): Promise<void> {
      const response = await fetch(`/api/runs/${runId}`);
      const json = (await response.json()) as RunResult | { error: string };

      if (!response.ok || "error" in json) {
        setError("Unable to load plan.");
        return;
      }

      setRun(json);
      setTargetAgent(json.plan.targetAgent);
    }

    void loadRun();
  }, [runId]);

  async function regenerate(): Promise<void> {
    if (!run) return;

    setBusy(true);
    setStatus(null);
    setError(null);

    try {
      const response = await fetch("/api/recompile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          intent: run.intent,
          targetAgent
        })
      });

      const json = (await response.json()) as RunResult | { error: string };
      if (!response.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Regeneration failed");
      }

      setRun(json);
      setStatus("Plan regenerated.");
    } catch (regenError) {
      setError(regenError instanceof Error ? regenError.message : "Regeneration failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyPlan(): Promise<void> {
    if (!run) return;
    await navigator.clipboard.writeText(run.plan.prompt);
    setStatus("Copied to clipboard.");
  }

  function downloadPlan(): void {
    if (!run) return;
    const blob = new Blob([run.plan.prompt], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Plan.md";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded Plan.md.");
  }

  if (error && !run) {
    return (
      <main className="intake-shell">
        <section className="intake-card">
          <h1 className="intake-title">Executable Plan</h1>
          <p className="error-text">{error}</p>
          <Link href="/" className="text-link">
            Back to intake
          </Link>
        </section>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="intake-shell">
        <section className="intake-card">
          <h1 className="intake-title">
            <DitherText source="LOADING PLAN" />
          </h1>
        </section>
      </main>
    );
  }

  return (
    <main className="plan-shell">
      <header className="plan-header">
        <div>
          <p className="u-caps u-faint">Executable Plan</p>
          <h1 className="intake-title">Claude Code Build Prompt</h1>
        </div>

        <div className="header-action-cluster">
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

          <button className="btn-compile" onClick={() => void regenerate()} disabled={busy}>
            {busy ? <DitherText source="REGENERATING PLAN" /> : "Regenerate"}
          </button>
          <button className="btn-compile" onClick={() => void copyPlan()}>
            Copy
          </button>
          <button className="btn-compile" onClick={() => downloadPlan()}>
            Download TXT
          </button>
          <Link href={`/workspace/${runId}`} className="btn-compile ghost-link">
            Back to Workspace
          </Link>
        </div>
      </header>

      <section className="plan-content">
        <pre className="plan-prompt">{run.plan.prompt}</pre>
      </section>

      {status ? <p className="status-text">{status}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </main>
  );
}
