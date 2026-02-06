"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useGlitch } from "react-powerglitch";
import { DitherText } from "@/components/dither-text";
import { RunResult, ScanMode } from "@/lib/models";

type LocalStage = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
};

const stagedTemplate: LocalStage[] = [
  { id: "fetch", label: "Fetch repository", status: "pending" },
  { id: "ingest", label: "Ingest workspace", status: "pending" },
  { id: "stack", label: "Stack detection", status: "pending" },
  { id: "arch", label: "Architecture extraction", status: "pending" },
  { id: "intent", label: "Intent extraction", status: "pending" },
  { id: "plan", label: "Plan compilation", status: "pending" }
];
const ANALYSIS_COMPLETE_SOUND_KEY = "mimickit:play-analysis-complete-sound";

export function RepoIntakePage(): React.ReactElement {
  const router = useRouter();
  const { data: session, status } = useSession();
  const glitch = useGlitch({
    playMode: "manual",
    createContainers: true,
    hideOverflow: false,
    timing: {
      duration: 300,
      iterations: 1,
      easing: "ease-in-out",
    },
    glitchTimeSpan: {
      start: 0,
      end: 1,
    },
    shake: {
      velocity: 12,
      amplitudeX: 0.04,
      amplitudeY: 0.04,
    },
    slice: {
      count: 4,
      velocity: 14,
      minHeight: 0.02,
      maxHeight: 0.15,
      hueRotate: true,
    },
    pulse: false,
  });

  // Fire a short glitch burst every 5 seconds
  useEffect(() => {
    const id = window.setInterval(() => {
      glitch.startGlitch();
      window.setTimeout(() => glitch.stopGlitch(), 300);
    }, 5000);
    // Trigger once on mount after a brief delay
    const initial = window.setTimeout(() => {
      glitch.startGlitch();
      window.setTimeout(() => glitch.stopGlitch(), 300);
    }, 800);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(initial);
    };
  }, [glitch]);
  // "what" tab state machine
  type WhatPhase = "idle" | "dither-in" | "showing" | "dither-out";
  const [whatPhase, setWhatPhase] = useState<WhatPhase>("idle");
  const whatTimers = useRef<number[]>([]);

  function clearWhatTimers() {
    whatTimers.current.forEach((t) => window.clearTimeout(t));
    whatTimers.current = [];
  }

  function handleWhatClick() {
    if (whatPhase === "idle") {
      clearWhatTimers();
      setWhatPhase("dither-in");
      whatTimers.current.push(
        window.setTimeout(() => setWhatPhase("showing"), 700)
      );
    } else if (whatPhase === "showing") {
      clearWhatTimers();
      setWhatPhase("dither-out");
      whatTimers.current.push(
        window.setTimeout(() => setWhatPhase("idle"), 700)
      );
    }
  }

  useEffect(() => {
    return () => clearWhatTimers();
  }, []);

  const showingWhat = whatPhase === "showing" || whatPhase === "dither-out";
  const isDithering = whatPhase === "dither-in" || whatPhase === "dither-out";

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

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(ANALYSIS_COMPLETE_SOUND_KEY, "1");
      }
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
      <div ref={glitch.ref} className="intake-logo-wrap">
        <img
          src="/mimickit-logo.png"
          alt="MimicKit"
          className="intake-logo"
          width={80}
          height={80}
        />
      </div>
      <section className={`intake-card ${busy ? "intake-card-loading" : ""}`} aria-busy={busy}>
        {/* "what" / "got it" tab */}
        <button
          type="button"
          className={`what-tab ${showingWhat ? "what-tab-active" : ""}`}
          onClick={handleWhatClick}
          disabled={isDithering || busy}
        >
          {showingWhat ? "Oh, got it thx" : "what"}
        </button>

        {/* ── dither transition overlay ── */}
        {isDithering && (
          <div className="what-dither-overlay" aria-hidden="true">
            <DitherText source="MIMICKIT INTENT TRANSPILER" className="what-dither-line" />
            <DitherText source="REVERSE ENGINEERING CODEBASE" className="what-dither-line" />
            <DitherText source="EXTRACTING ARCHITECTURE" className="what-dither-line" />
            <DitherText source="COMPILING EXECUTABLE PLAN" className="what-dither-line" />
          </div>
        )}

        {/* ── original card content ── */}
        <div className={`what-content ${showingWhat ? "what-content-hidden" : ""} ${isDithering ? "what-content-dithering" : ""}`}>
          <p className="u-caps u-faint">MimeKit / Intent Transpiler</p>
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

          {error ? <p className="error-text">{error}</p> : null}
        </div>

        {/* ── "what" explanation content ── */}
        <div className={`what-content what-explain ${showingWhat ? "" : "what-content-hidden"} ${isDithering ? "what-content-dithering" : ""}`}>
          <p className="u-caps u-faint">MimeKit / What is this?</p>
          <h1 className="intake-title">Behavioral Transpiler</h1>
          <p className="what-explain-body">
            MimicKit is an intent transpiler for software systems. Point it at any GitHub
            repository and it will scan the entire codebase &mdash; detecting the tech stack,
            extracting the architecture graph, and reverse-engineering the original developer
            intent. It then compiles everything into a structured, executable plan that an AI
            coding agent can follow to faithfully reproduce, extend, or migrate the project
            from scratch. Think of it as a blueprint extractor: it reads the code so an AI
            doesn&apos;t have to guess.
          </p>
        </div>

        {busy ? (
          <div className="intake-loading-overlay" role="status" aria-live="polite">
            <div className="intake-loading-chip">
              <div className="stack-loading-line">
                <span className="stack-loading-dot" />
                <DitherText source="ANALYZING REPOSITORY" className="intake-loading-main" />
              </div>
              <div className="intake-loading-lines">
                <DitherText source="SCANNING FILE TREE" className="intake-loading-step" />
                <DitherText source="DETECTING STACK SIGNALS" className="intake-loading-step" />
                <DitherText source="EXTRACTING ARCHITECTURE + INTENT" className="intake-loading-step" />
                <DitherText source="COMPILING EXECUTABLE PLAN" className="intake-loading-step" />
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
