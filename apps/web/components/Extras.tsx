"use client";

import { buildAccountantSummary, type CompanyRecord, compareNotice, FIELDS, type NoticeFacts, usd } from "@good-standing/core";
import { useRef, useState } from "react";
import { downloadText } from "../lib/download";
import { printMarkdown } from "../lib/markdown";

type Ctx = { taxYear: number; today: string };

/** "Got a notice from Delaware?" Upload it; the comparison is recomputed live as the record changes. */
export function NoticePanel({
  record,
  ctx,
  notice,
  onUpload,
  busy,
  error,
}: {
  record: CompanyRecord;
  ctx: Ctx;
  notice: NoticeFacts | null;
  onUpload: (file: File) => void;
  busy: boolean;
  error: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const comparison = notice ? compareNotice(notice, record, { defaultTaxYear: ctx.taxYear }) : null;

  return (
    <div className="panel glass notice">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Delaware notice</p>
          <h3>{comparison ? "What your notice means" : "Got a scary notice from Delaware?"}</h3>
          {!comparison ? (
            <p className="muted small">
              Delaware bills by its default method, which can be tens of thousands of dollars. Upload the notice and Good Standing explains the number and what you actually owe.
            </p>
          ) : null}
        </div>
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Reading…" : comparison ? "Upload another" : "Upload notice (PDF)"}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
      </div>
      {error ? <p className="warn-note">{error}</p> : null}
      {comparison ? (
        <div className="notice-body">
          {comparison.status === "ok" ? (
            <div className="notice-compare">
              <div>
                <span className="eyebrow">Notice says{comparison.comparedAs === "franchise_tax" ? " (tax)" : ""}</span>
                <span className="notice-num struck-soft">{usd(comparison.noticeAmountUsd)}</span>
              </div>
              <div>
                <span className="eyebrow">You owe{comparison.comparedAs === "franchise_tax" ? " (tax)" : ""}</span>
                <span className="notice-num">{usd(comparison.yourAmountUsd)}</span>
              </div>
              {comparison.savingsUsd > 0 ? <span className="pill pill-ok">{usd(comparison.savingsUsd)} less</span> : null}
            </div>
          ) : null}
          {comparison.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          {comparison.status === "needs_confirmation" ? (
            <ul className="todo-inline">
              {comparison.missing.map((m) => (
                <li key={m.field} className="pill pill-warn">
                  {FIELDS[m.field].label}
                </li>
              ))}
            </ul>
          ) : null}
          {comparison.warnings.map((w) => (
            <p key={w} className="warn-note">
              {w}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A summary to hand to an accountant: download as Markdown, or print / save as PDF. */
export function AccountantPanel({ record, ctx }: { record: CompanyRecord; ctx: Ctx }) {
  const [blocked, setBlocked] = useState(false);
  const summary = () => buildAccountantSummary(record, ctx);
  return (
    <div className="panel glass packet">
      <div>
        <p className="eyebrow">For your accountant</p>
        <h3>Share a summary</h3>
        <p className="muted">
          Every fact with its status and source, the franchise tax workings, your obligations and the open questions. Built in your browser. Nothing is uploaded or stored.
        </p>
        {blocked ? <p className="warn-note">Your browser blocked the print window. Allow pop-ups for this site, or download the file instead.</p> : null}
      </div>
      <div className="packet-actions">
        <button
          type="button"
          className="btn btn-chrome"
          onClick={() => {
            const s = summary();
            setBlocked(!printMarkdown(s.fileName.replace(/\.md$/, ""), s.markdown));
          }}
        >
          Print / save as PDF
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            const s = summary();
            downloadText(s.fileName, s.markdown, "text/markdown;charset=utf-8");
          }}
        >
          Download (.md)
        </button>
      </div>
    </div>
  );
}
