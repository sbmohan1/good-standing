"use client";

import {
  type CompanyRecord,
  type CompanyRecordField,
  DISCLAIMER,
  defaultTaxYear,
  LUMEN_LABS_TODAY,
  lumenLabsRecord,
  summarizeObligations,
} from "@good-standing/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmFields, demoRecord, documentFields, localToday } from "../lib/records";
import { LiquidChrome } from "./LiquidChrome";
import { Cursor, Magnetic, Reveal, SplitWords } from "./motion";
import { CalendarView, OweCard, PacketPanel } from "./Results";
import { DocumentFacts, Questions } from "./ReviewPanel";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL;

interface UploadReport {
  documents: Array<{ docName: string; documentType: string; totalPages: number; fields: Array<{ name: string; page: number; verified: boolean }> }>;
  unverifiedFields: CompanyRecordField[];
  conflicts: string[];
  notes: string[];
  founderHints: Array<{ name: string; shares: number; pctOfExtractedShares: number }>;
  failures: string[];
}

// The hero's sample answer comes from the engine itself, for the fictional demo company.
const SAMPLE = summarizeObligations(lumenLabsRecord, { taxYear: 2026, today: LUMEN_LABS_TODAY });

function Nav() {
  return (
    <header className="nav">
      <a href="#top" className="brand" data-cursor="Top">
        <span className="brand-mark" aria-hidden="true" />
        Good Standing
      </a>
      <nav className="nav-links">
        <a href="#how">How it works</a>
        <a href="#mcp">For your agent</a>
        <a href="#app">Try it</a>
        {REPO_URL ? (
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        ) : null}
      </nav>
      <span className="nav-tag mono">Unofficial · Not affiliated with Stripe</span>
    </header>
  );
}

function AgentCard() {
  return (
    <div className="agent glass">
      <div className="agent-bar mono">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span>claude · good-standing mcp</span>
      </div>
      <p className="agent-user">
        <span className="mono">you</span> What does my company owe this year?
      </p>
      <div className="agent-reply">
        <span className="mono">agent</span>
        <div>
          {SAMPLE.headline.slice(0, 2).map((line, i) => (
            <p key={line} className="type-line" style={{ animationDelay: `${1100 + i * 900}ms` }}>
              {line}
            </p>
          ))}
          <p className="type-line" style={{ animationDelay: "2900ms" }}>
            Here's your packet. <span className="caret" />
          </p>
        </div>
      </div>
      <p className="agent-foot mono">Lumen Labs, Inc. · fictional demo company</p>
    </div>
  );
}

export function Experience() {
  const [record, setRecord] = useState<CompanyRecord | null>(null);
  const [report, setReport] = useState<UploadReport | null>(null);
  const [mode, setMode] = useState<"demo" | "upload" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(LUMEN_LABS_TODAY);
  const fileInput = useRef<HTMLInputElement>(null);
  const appRef = useRef<HTMLElement>(null);

  useEffect(() => setToday(localToday()), []);
  // ?demo opens straight into the demo company (?demo=confirmed skips the review), handy for sharing.
  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo !== null) {
      const r = demoRecord();
      setRecord(demo === "confirmed" ? confirmFields(r, documentFields(r)) : r);
      setMode("demo");
    }
  }, []);
  const ctx = { taxYear: defaultTaxYear(today), today };

  const scrollToApp = () => requestAnimationFrame(() => appRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

  const startDemo = useCallback(() => {
    setRecord(demoRecord());
    setReport(null);
    setError(null);
    setMode("demo");
    scrollToApp();
  }, []);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const pdfs = Array.from(files);
    const total = pdfs.reduce((sum, f) => sum + f.size, 0);
    if (pdfs.some((f) => f.type && f.type !== "application/pdf")) return setError("Only PDF files, please.");
    if (total > 4 * 1024 * 1024) return setError("Uploads are limited to 4 MB in total on this demo.");
    setMode("upload");
    setBusy(true);
    setError(null);
    setRecord(null);
    scrollToApp();
    try {
      const body = new FormData();
      for (const f of pdfs) body.append("files", f);
      const res = await fetch("/api/extract", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setRecord(json.record as CompanyRecord);
      setReport(json as UploadReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <>
      <div className="chrome-fallback" aria-hidden="true" />
      <LiquidChrome />
      <div className="scrim" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <Cursor />
      <Nav />

      <main id="top">
        <section className="hero">
          <p className="eyebrow mono hero-eyebrow">
            <span className="idx">[01]</span> After incorporation
          </p>
          <h1>
            <SplitWords text="Atlas forms your company in a day." />
            <br />
            <em>
              <SplitWords text="Staying in good standing is on you." delay={420} />
            </em>
          </h1>
          <p className="lede">
            Good Standing reads your formation documents, builds your company record, and tells you what you owe, when it's due and why. Every number traces to a page, an answer or an
            official source. You review it and file it yourself.
          </p>
          <div className="cta">
            <Magnetic>
              <button type="button" className="btn btn-chrome btn-lg" data-cursor="Demo" onClick={startDemo}>
                Try the demo company <span aria-hidden="true">→</span>
              </button>
            </Magnetic>
            <Magnetic strength={0.25}>
              <button type="button" className="btn btn-outline btn-lg" data-cursor="PDF" onClick={() => fileInput.current?.click()}>
                Upload your Certificate of Incorporation
              </button>
            </Magnetic>
            <input ref={fileInput} type="file" accept="application/pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
          </div>
          <p className="fine mono">PDF · up to 4 MB · processed in memory, never stored</p>
          <AgentCard />
        </section>

        <section id="how" className="section">
          <Reveal>
            <p className="eyebrow mono">
              <span className="idx">[02]</span> How it works
            </p>
            <h2>
              The model reads. <em>Code does the math.</em> You file.
            </h2>
          </Reveal>
          <ol className="steps">
            {[
              ["Reads your documents", "Claude pulls each fact with its page and a verbatim quote. Every quote is checked against the PDF's own text, and anything that doesn't match is flagged."],
              ["Never guesses", "Missing or unconfirmed facts stay unconfirmed. The franchise tax estimate refuses to run until you confirm authorized shares, par value, issued shares and gross assets."],
              ["Does the math in code", "Money and dates come from deterministic, unit-tested TypeScript. Both Delaware methods, with every step shown, and the lower one chosen."],
              ["Prepares, you file", "A pre-filled packet and a calendar of what applies, with sources and as-of dates. Read-only: nothing is filed, paid or written to Stripe."],
            ].map(([title, body], i) => (
              <Reveal as="li" key={title} delay={i * 90} className="step">
                <span className="step-n mono">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section id="mcp" className="section split-section">
          <Reveal>
            <p className="eyebrow mono">
              <span className="idx">[03]</span> For your agent
            </p>
            <h2>
              Ask from Claude Code, <em>Claude Desktop or Cursor.</em>
            </h2>
            <p className="lede">Good Standing ships as an MCP server. Your company record stays in a local file you control, and every answer ends with its sources.</p>
          </Reveal>
          <Reveal delay={120}>
            <pre className="code glass">
              <code>{`{
  "mcpServers": {
    "good-standing": {
      "command": "node",
      "args": ["packages/mcp/src/index.ts"]
    }
  }
}`}</code>
            </pre>
          </Reveal>
        </section>

        <section id="app" ref={appRef} className="section app">
          <Reveal>
            <p className="eyebrow mono">
              <span className="idx">[04]</span> Your company
            </p>
            <h2>{mode === "upload" ? "Your documents, checked." : <>See it work on <em>Lumen Labs.</em></>}</h2>
          </Reveal>

          {!record && !busy ? (
            <div className="empty glass">
              <p>Start with the fictional demo company, or upload your own Certificate of Incorporation and stock purchase agreement.</p>
              <div className="cta">
                <button type="button" className="btn btn-chrome" onClick={startDemo}>
                  Try the demo company
                </button>
                <button type="button" className="btn btn-outline" onClick={() => fileInput.current?.click()}>
                  Upload PDFs
                </button>
              </div>
            </div>
          ) : null}

          {busy ? (
            <div className="panel glass loading">
              <span className="loader" aria-hidden="true" />
              <div>
                <h3>Reading your documents</h3>
                <p className="muted">Pulling each fact with its page and quote, then checking every quote against the PDF.</p>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="panel glass error" role="alert">
              <p>{error}</p>
            </div>
          ) : null}

          {record ? (
            <div className="flow">
              {report && (report.conflicts.length > 0 || report.failures.length > 0 || report.notes.length > 0) ? (
                <div className="panel glass notes">
                  {report.failures.map((f) => (
                    <p key={f} className="warn-note">
                      {f}
                    </p>
                  ))}
                  {report.conflicts.map((c) => (
                    <p key={c} className="warn-note">
                      {c}
                    </p>
                  ))}
                  {report.notes.map((n) => (
                    <p key={n} className="muted small">
                      {n}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="flow-review">
                <DocumentFacts record={record} onChange={setRecord} unverified={report?.unverifiedFields ?? []} />
                <Questions key={mode} record={record} onChange={setRecord} founderHints={report?.founderHints ?? []} />
              </div>
              <Reveal>
                <OweCard record={record} ctx={ctx} />
              </Reveal>
              <div className="flow-calendar">
                <div className="section-mini">
                  <p className="eyebrow mono">Compliance calendar · tax year {ctx.taxYear}</p>
                </div>
                <CalendarView record={record} ctx={ctx} />
              </div>
              <PacketPanel record={record} ctx={ctx} />
            </div>
          ) : null}
        </section>
      </main>

      <footer className="footer">
        <div className="footer-top">
          <p className="footer-big">
            Good <em>Standing</em>
          </p>
          <div className="footer-cols">
            <p className="mono">Built for Stripe Atlas founders. Not affiliated with Stripe.</p>
            <p className="mono">Processed in memory, never stored.</p>
            {REPO_URL ? (
              <a className="mono" href={REPO_URL} target="_blank" rel="noreferrer">
                Source on GitHub ↗
              </a>
            ) : null}
          </div>
        </div>
        <p className="disclaimer">{DISCLAIMER}</p>
      </footer>
    </>
  );
}
