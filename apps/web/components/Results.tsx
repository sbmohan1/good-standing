"use client";

import {
  buildCalendarIcs,
  buildFilingPacket,
  type CalendarEntry,
  type CompanyRecord,
  type CompanyRecordField,
  estimateFranchiseTax,
  FIELDS,
  formatDate,
  summarizeObligations,
  usd,
} from "@good-standing/core";
import { downloadText } from "../lib/download";
import { confirmFields } from "../lib/records";
import { CountUp, Reveal, TiltCard } from "./motion";
import { FieldEditor } from "./ReviewPanel";

type Ctx = { taxYear: number; today: string };

const WHERE_FROM: Partial<Record<CompanyRecordField, string>> = {
  issuedShares: "Usually in your stock purchase agreement. Upload it too, or enter the total shares issued (including treasury shares).",
  shareClasses: "In your Certificate of Incorporation, under authorized stock.",
  grossAssets: "Total assets from your Form 1120, Schedule L. Not your bank or Stripe balance.",
  entityType: "C-corp or LLC, from your formation documents.",
};

export function OweCard({ record, ctx, onChange }: { record: CompanyRecord; ctx: Ctx; onChange: (next: CompanyRecord) => void }) {
  const estimate = estimateFranchiseTax(record, { taxYear: ctx.taxYear });

  if (estimate.status === "not_applicable") {
    return (
      <div className="panel glass">
        <p className="eyebrow">Delaware franchise tax</p>
        <p>{estimate.message}</p>
      </div>
    );
  }
  if (estimate.status === "needs_confirmation") {
    return (
      <div className="panel glass locked">
        <p className="eyebrow">Delaware says / you owe</p>
        <h3>Not calculated yet</h3>
        <p className="muted">Good Standing won't guess. Fill in or confirm these and the estimate appears:</p>
        <ul className="todo">
          {estimate.missing.map((m) => {
            const fact = record[m.field];
            return (
              <li key={m.field}>
                <div className="todo-head">
                  <span className="pill pill-warn">{FIELDS[m.field].label}</span> {m.reason}
                </div>
                {fact.status === "needs_confirmation" && fact.value !== null ? (
                  <button type="button" className="btn btn-small" onClick={() => onChange(confirmFields(record, [m.field]))}>
                    Confirm
                  </button>
                ) : (
                  <>
                    {WHERE_FROM[m.field] ? <p className="muted small">{WHERE_FROM[m.field]}</p> : null}
                    <FieldEditor key={m.field} record={record} field={m.field} onSave={onChange} />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const apv = estimate.assumedParValue;
  const lower = estimate.delawareNotice.gapUsd > 0;
  return (
    <TiltCard className="owe" max={4}>
      <div className="owe-grid">
        <div className="owe-col">
          <p className="eyebrow">Delaware says</p>
          <p className={`owe-num ${lower ? "struck" : ""}`}>
            <CountUp value={estimate.delawareNotice.taxUsd} />
          </p>
          <p className="muted small">Default Authorized Shares method, the number on Delaware's notice</p>
        </div>
        <div className="owe-col">
          <p className="eyebrow">You owe</p>
          <p className="owe-num chrome-text">
            <CountUp value={estimate.totalDueUsd} duration={1800} />
          </p>
          <p className="muted small">
            {usd(estimate.taxUsd)} tax ({estimate.method === "assumed_par_value" ? "Assumed Par Value" : "Authorized Shares"} method) + {usd(estimate.annualReportFeeUsd)} annual report fee
          </p>
        </div>
      </div>
      <div className="owe-due">
        <span className="pill pill-chrome">File by {formatDate(estimate.dueDate)}</span>
        {lower ? <span className="muted small">{usd(estimate.delawareNotice.gapUsd)} less than the notice, if you report gross assets and issued shares.</span> : null}
      </div>

      <details className="workings">
        <summary data-cursor="Show">Show the math, both methods</summary>
        <div className="workings-grid">
          <div>
            <h4>Authorized Shares · {usd(estimate.authorizedShares.taxUsd)}</h4>
            <ol>
              {estimate.authorizedShares.workings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ol>
          </div>
          <div>
            <h4>Assumed Par Value Capital · {apv.status === "ok" ? usd(apv.taxUsd) : "not calculated"}</h4>
            <ol>
              {(apv.status === "ok" ? apv.workings : [apv.reason]).map((w) => (
                <li key={w}>{w.trim()}</li>
              ))}
            </ol>
          </div>
        </div>
        {estimate.installments ? (
          <div className="installments">
            <h4>Installments</h4>
            <ul>
              {estimate.installments.map((i) => (
                <li key={i.date}>
                  {formatDate(i.date)} · {i.percent}% · {usd(i.usd)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {estimate.flags.length > 0 ? (
          <ul className="flags">
            {estimate.flags.map((f) => (
              <li key={f.id}>{f.message}</li>
            ))}
          </ul>
        ) : null}
        <p className="muted small">
          If late: {estimate.latePenalty} Sources:{" "}
          {estimate.sourceUrls.map((u, i) => (
            <span key={u}>
              {i > 0 ? ", " : ""}
              <a href={u} target="_blank" rel="noreferrer">
                {new URL(u).hostname}
              </a>
            </span>
          ))}
        </p>
      </details>
    </TiltCard>
  );
}

function Entry({ e, index }: { e: CalendarEntry; index: number }) {
  return (
    <Reveal as="li" delay={index * 60} className={`cal-item ${e.urgent ? "is-urgent" : ""}`}>
      <div className="cal-date">
        {e.due ? (
          <>
            <span className="cal-month">{formatDate(e.due.date).split(" ")[0]}</span>
            <span className="cal-day">{formatDate(e.due.date).split(" ")[1]?.replace(",", "")}</span>
            <span className="cal-year">{e.due.date.slice(0, 4)}</span>
            {e.due.approximate ? <span className="cal-approx">approx.</span> : null}
          </>
        ) : (
          <span className="cal-month">—</span>
        )}
      </div>
      <div className="cal-body">
        <div className="cal-title">
          <h4>{e.title}</h4>
          {e.label ? <span className="pill pill-warn">{e.label}</span> : null}
          {e.amount?.usd != null ? <span className="pill pill-chrome">{usd(e.amount.usd)}</span> : null}
        </div>
        <p>{e.reason}</p>
        {e.due?.note ? <p className="muted small">{e.due.note}</p> : null}
        {e.penalty ? <p className="penalty">If missed: {e.penalty}</p> : null}
        <p className="sources">
          {e.sourceUrls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              {new URL(u).hostname.replace(/^www\./, "")}
            </a>
          ))}
          <span>checked {e.asOf}</span>
          {e.verifyNote ? <span title={e.verifyNote}>· to verify</span> : null}
        </p>
      </div>
    </Reveal>
  );
}

export function CalendarView({ record, ctx }: { record: CompanyRecord; ctx: Ctx }) {
  const summary = summarizeObligations(record, ctx);
  const { calendar } = summary;
  const exportIcs = () => {
    const { fileName, ics } = buildCalendarIcs(calendar, { companyName: record.legalName.value ?? "Your company", generatedAt: new Date().toISOString() });
    downloadText(fileName, ics, "text/calendar;charset=utf-8");
  };
  const dated = [...calendar.applies, ...calendar.maybe].filter((e) => e.due).length;
  return (
    <div className="calendar">
      {dated > 0 ? (
        <div className="cal-export">
          <p className="muted small">
            Add {dated} deadline{dated === 1 ? "" : "s"} to Google Calendar, Apple Calendar or Outlook, with reminders 30 and 7 days before.
          </p>
          <button type="button" className="btn btn-outline" data-cursor="Save" onClick={exportIcs}>
            Add to calendar (.ics)
          </button>
        </div>
      ) : null}
      <div className="headline glass">
        {summary.headline.map((h) => (
          <p key={h}>{h}</p>
        ))}
      </div>
      <div className="cal-group">
        <h3>
          <span className="count">{calendar.applies.length}</span> Applies
        </h3>
        <ul>
          {calendar.applies.map((e, i) => (
            <Entry key={e.ruleId} e={e} index={i} />
          ))}
        </ul>
      </div>
      {calendar.maybe.length > 0 ? (
        <div className="cal-group">
          <h3>
            <span className="count">{calendar.maybe.length}</span> May apply
          </h3>
          <ul>
            {calendar.maybe.map((e, i) => (
              <Entry key={e.ruleId} e={e} index={i} />
            ))}
          </ul>
        </div>
      ) : null}
      <div className="cal-group not-required">
        <h3>
          <span className="count">{calendar.notRequired.length}</span> Not required
        </h3>
        <ul className="nr">
          {calendar.notRequired.map((e) => (
            <li key={e.ruleId}>
              <strong>{e.title}</strong>
              <span>{e.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PacketPanel({ record, ctx }: { record: CompanyRecord; ctx: Ctx }) {
  const packet = buildFilingPacket(record, ctx);
  if (packet.status !== "ok") return null;
  const download = () => downloadText(packet.fileName, packet.markdown, "text/markdown;charset=utf-8");
  return (
    <div className="panel glass packet">
      <div>
        <p className="eyebrow">Ready to file</p>
        <h3>Your Delaware filing packet</h3>
        <p className="muted">
          Pre-filled annual report fields with their sources, both calculations, a checklist and the links. Generated in your browser. You review it and file it yourself.
        </p>
      </div>
      <button type="button" className="btn btn-chrome" data-cursor="Download" onClick={download}>
        Download packet (.md)
      </button>
    </div>
  );
}
