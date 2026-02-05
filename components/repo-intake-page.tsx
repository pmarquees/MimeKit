"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { DitherText } from "@/components/dither-text";
import { RunResult, ScanMode } from "@/lib/models";

type LocalStage = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
};

const stagedTemplate: LocalStage[] = [
  { id: "intake", label: "Repo intake", status: "pending" },
  { id: "stack", label: "Stack detection", status: "pending" },
  { id: "arch", label: "Architecture extraction", status: "pending" },
  { id: "intent", label: "Intent extraction", status: "pending" },
  { id: "plan", label: "Plan compilation", status: "pending" }
];

export function RepoIntakePage(): React.ReactElement {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [repoUrl, setRepoUrl] = useState("https://github.com/vercel/next.js");
  const [branch, setBranch] = useState("");
  const [scanMode, setScanMode] = useState<ScanMode>("quick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<LocalStage[]>(stagedTemplate);

  async function onAnalyze(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStages(stagedTemplate.map((stage, index) => (index === 0 ? { ...stage, status: "running" } : stage)));

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl,
          branch: branch || undefined,
          scanMode
        })
      });

      const json = (await response.json()) as RunResult | { error: string };
      if (!response.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Failed to analyze repository");
      }

      setStages(
        json.stages.map((stage) => ({
          id: stage.id,
          label: stage.label,
          status: stage.status
        }))
      );

      router.push(`/workspace/${json.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unexpected error");
      setStages((previous) =>
        previous.map((stage, index) =>
          index === 0 || stage.status === "running"
            ? {
                ...stage,
                status: "error"
              }
            : stage
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="intake-shell">
      <section className="intake-card">
        <p className="u-caps u-faint">MimicKit / Behavioral Transpiler</p>
        <h1 className="intake-title">Repository Intake</h1>
        <p className="intake-subtitle">
          Analyze a public GitHub repository and generate architecture, intent, and executable plan.
        </p>
        <div className="auth-row">
          <div className="auth-text">
            <span className="u-caps u-muted">GitHub Auth</span>
            <span>
              {status === "loading"
                ? <DitherText source="CHECKING SESSION" />
                : session?.user
                  ? `Signed in as ${session.user.name ?? session.user.email ?? "GitHub user"}`
                  : "Not signed in. Public rate limit may be low."}
            </span>
          </div>
          {session?.user ? (
            <button type="button" className="btn-compile ghost-link" onClick={() => void signOut()}>
              Sign Out
            </button>
          ) : (
            <button type="button" className="btn-compile ghost-link" onClick={() => void signIn("github")}>
              Sign In with GitHub
            </button>
          )}
        </div>

        <form onSubmit={onAnalyze} className="intake-form">
          <label className="form-label" htmlFor="repo-url">
            Repo URL
          </label>
          <input
            id="repo-url"
            className="url-input"
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder="https://github.com/owner/repo"
            required
          />

          <label className="form-label" htmlFor="branch">
            Branch (optional)
          </label>
          <input
            id="branch"
            className="url-input"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            placeholder="main"
          />

          <label className="form-label" htmlFor="scan-mode">
            Scan Mode
          </label>
          <select
            id="scan-mode"
            className="select-input"
            value={scanMode}
            onChange={(event) => setScanMode(event.target.value as ScanMode)}
          >
            <option value="quick">Quick</option>
            <option value="deep">Deep</option>
          </select>

          <p className="form-hint">
            Sign in with GitHub to use higher API limits for analysis requests.
          </p>

          <button type="submit" className="btn-compile" disabled={busy}>
            <span className={`status-dot ${busy ? "active" : ""}`} />
            {busy ? <DitherText source="ANALYZING REPOSITORY" /> : "Analyze Repository"}
          </button>
        </form>

        <div className="stage-list">
          {stages.map((stage) => (
            <div className="stage-row" key={stage.id}>
              <span>{stage.label}</span>
              <span className={`stage-pill stage-${stage.status}`}>
                {stage.status === "running" ? <DitherText source="RUNNING" /> : stage.status}
              </span>
            </div>
          ))}
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
