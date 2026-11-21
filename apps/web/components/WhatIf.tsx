"use client";

import { calculateFranchiseTax, type CompanyRecord, count, estimateFranchiseTax, type ShareClass, usd } from "@good-standing/core";
import { useState } from "react";

type Ctx = { taxYear: number; today: string };

// Log-scale sliders: share counts and assets span several orders of magnitude.
const STEPS = 1000;
function toSlider(value: number, min: number, max: number): number {
  const v = Math.min(Math.max(value, min), max);
  return Math.round(((Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))) * STEPS);
}
function fromSlider(step: number, min: number, max: number): number {
  const raw = 10 ** (Math.log10(min) + (step / STEPS) * (Math.log10(max) - Math.log10(min)));
  // Keep two significant figures so slider values look like numbers people choose.
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 1);
  return Math.round(raw / magnitude) * magnitude;
}

function parseCount(text: string): number | null {
  const n = Number(text.replace(/[$,\s]/g, ""));
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

function Field({
  label,
  help,
  value,
  onChange,
  min,
  max,
  prefix = "",
}: {
  label: string;
  help: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  prefix?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="wi-field">
      <div className="wi-label">
        <span>{label}</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={text ?? `${prefix}${count(value)}`}
          onFocus={() => setText(String(value))}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseCount(e.target.value);
            if (n !== null) onChange(Math.round(n));
          }}
          onBlur={() => setText(null)}
        />
      </div>
      <input
        type="range"
        min={0}
        max={STEPS}
        value={toSlider(Math.max(value, min), min, max)}
        onChange={(e) => onChange(fromSlider(Number(e.target.value), min, max))}
        aria-label={`${label} slider`}
      />
      <p className="muted small">{help}</p>
    </div>
  );
}

export function WhatIf({ record, ctx }: { record: CompanyRecord; ctx: Ctx }) {
  const classes = (record.shareClasses.value ?? []) as ShareClass[];
  // The record's values seed the scenario; "Reset to my record" returns to them.
  const initial = {
    authorized: classes.reduce((sum, c) => sum + c.authorizedShares, 0) || 10_000_000,
    par: classes.length === 1 && classes[0]!.parValue !== null ? String(classes[0]!.parValue) : classes.length === 0 ? "0.00001" : "",
    issued: record.issuedShares.value ?? 8_000_000,
    gross: record.grossAssets.value ?? 50_000,
  };
  const [authorized, setAuthorized] = useState(initial.authorized);
  const [par, setPar] = useState(initial.par);
  const [issued, setIssued] = useState(initial.issued);
  const [gross, setGross] = useState(initial.gross);

  const parValue = par.trim() === "" ? null : Number(par);
  const parValid = parValue === null || (Number.isFinite(parValue) && parValue >= 0);
  const issuedClamped = Math.min(issued, authorized);

  const calc = parValid
    ? calculateFranchiseTax({ shareClasses: [{ name: "All classes", authorizedShares: Math.max(1, authorized), parValue }], issuedShares: issuedClamped, grossAssets: gross, amendedAuthorizedSharesThisYear: record.amendedAuthorizedSharesThisYear.value ?? false, listedOnNationalExchange: record.listedOnNationalExchange.value ?? false }, { taxYear: ctx.taxYear })
    : null;
  const current = estimateFranchiseTax(record, { taxYear: ctx.taxYear });
  const delta = calc && current.status === "ok" ? calc.totalDueUsd - current.totalDueUsd : null;
  const reset = () => {
    setAuthorized(initial.authorized);
    setPar(initial.par);
    setIssued(initial.issued);
    setGross(initial.gross);
  };

  return (
    <div className="panel glass whatif">
      <div className="panel-head">
        <div>
          <p className="eyebrow">What if</p>
          <h3>Try different numbers</h3>
          <p className="muted small">A scenario only. It doesn&apos;t change your record. Same engine, both methods.</p>
        </div>
        <button type="button" className="btn btn-small btn-ghost" onClick={reset}>
          Reset to my record
        </button>
      </div>
      <div className="wi-grid">
        <div className="wi-inputs">
          <Field label="Authorized shares" help="Fewer authorized shares lowers Delaware's default bill. Changing it needs a charter amendment." value={authorized} onChange={setAuthorized} min={5_000} max={100_000_000} />
          <Field label="Issued shares" help="Including treasury shares. Can't exceed authorized shares." value={issuedClamped} onChange={setIssued} min={1_000} max={Math.max(1_001, authorized)} />
          <Field label="Gross assets" help="Total assets on Form 1120, Schedule L. Raising money raises this." value={gross} onChange={setGross} min={1_000} max={50_000_000} prefix="$" />
          <div className="wi-field">
            <label className="wi-label">
              <span>Par value per share</span>
              <input type="text" inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} placeholder="blank = no par" />
            </label>
            {!parValid ? <p className="warn-note">Enter a number, or leave blank for no-par stock.</p> : null}
          </div>
        </div>
        <div className="wi-result">
          {calc ? (
            <>
              <div className={`wi-method ${calc.method === "authorized_shares" ? "is-chosen" : ""}`}>
                <span className="eyebrow">Authorized Shares</span>
                <span className="wi-num">{usd(calc.authorizedShares.taxUsd)}</span>
              </div>
              <div className={`wi-method ${calc.method === "assumed_par_value" ? "is-chosen" : ""}`}>
                <span className="eyebrow">Assumed Par Value</span>
                <span className="wi-num">{calc.assumedParValue.status === "ok" ? usd(calc.assumedParValue.taxUsd) : "n/a"}</span>
                {calc.assumedParValue.status !== "ok" ? <span className="muted small">{calc.assumedParValue.reason}</span> : null}
              </div>
              <div className="wi-total">
                <span>You&apos;d owe</span>
                <strong>{usd(calc.totalDueUsd)}</strong>
                <span className="muted small">
                  {usd(calc.taxUsd)} tax + {usd(calc.annualReportFeeUsd)} annual report fee
                </span>
                {delta !== null && delta !== 0 ? (
                  <span className={`pill ${delta > 0 ? "pill-warn" : "pill-ok"}`}>
                    {delta > 0 ? "+" : "−"}
                    {usd(Math.abs(delta))} vs. your estimate
                  </span>
                ) : null}
              </div>
              {calc.flags.map((f) => (
                <p key={f.id} className="warn-note">
                  {f.message}
                </p>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
