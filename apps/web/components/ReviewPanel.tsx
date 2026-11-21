"use client";

import {
  type CompanyRecord,
  type CompanyRecordField,
  displayValue,
  FIELDS,
  type Founder,
  type ShareClass,
} from "@good-standing/core";
import { useState } from "react";
import { clearFact, confirmFields, documentFields, setUserFact } from "../lib/records";

type Update = (next: CompanyRecord) => void;

const STATUS = {
  confirmed: { label: "Confirmed", className: "pill pill-ok" },
  needs_confirmation: { label: "Needs confirmation", className: "pill pill-warn" },
  missing: { label: "Missing", className: "pill" },
} as const;

function Citation({ record, field }: { record: CompanyRecord; field: CompanyRecordField }) {
  const p = record[field].provenance;
  if (!p) return <span className="cite muted">No source yet</span>;
  if (p.kind === "document") {
    return (
      <span className="cite">
        <span className="cite-src">
          {p.docName.replace(/\.pdf$/i, "")} · p.{p.page}
        </span>
        <q>{p.quote}</q>
      </span>
    );
  }
  if (p.kind === "user") return <span className="cite muted">Your answer</span>;
  return <span className="cite muted">Stripe {p.object}.{p.field}</span>;
}

/** Inline editor for the document facts we know how to edit as a single value. */
function FieldEditor({ record, field, onSave, onCancel }: { record: CompanyRecord; field: CompanyRecordField; onSave: Update; onCancel: () => void }) {
  const fact = record[field];
  const initial = (() => {
    if (field === "shareClasses") {
      const c = (fact.value as ShareClass[] | null)?.[0];
      return { a: String(c?.authorizedShares ?? ""), b: c?.parValue == null ? "" : String(c.parValue), name: c?.name ?? "Common Stock" };
    }
    return { a: fact.value == null ? "" : String(fact.value), b: "", name: "" };
  })();
  const [a, setA] = useState(initial.a);
  const [b, setB] = useState(initial.b);

  const save = () => {
    switch (field) {
      case "shareClasses": {
        const authorized = Number(a.replace(/,/g, ""));
        if (!Number.isInteger(authorized) || authorized <= 0) return;
        const par = b.trim() === "" ? null : Number(b);
        onSave(setUserFact(record, field, [{ name: initial.name, authorizedShares: authorized, parValue: par }]));
        return;
      }
      case "issuedShares": {
        const n = Number(a.replace(/,/g, ""));
        if (Number.isInteger(n) && n >= 0) onSave(setUserFact(record, field, n));
        return;
      }
      case "entityType":
        onSave(setUserFact(record, field, a === "llc" ? "llc" : "c_corp"));
        return;
      default:
        if (a.trim()) onSave(setUserFact(record, field, a.trim() as never));
    }
  };

  const type = field === "incorporationDate" || field === "founderStockIssueDate" ? "date" : field === "issuedShares" ? "text" : "text";
  return (
    <div className="editor">
      {field === "entityType" ? (
        <select value={a} onChange={(e) => setA(e.target.value)}>
          <option value="c_corp">C-corp</option>
          <option value="llc">LLC</option>
        </select>
      ) : (
        <input type={type} inputMode={field === "issuedShares" || field === "shareClasses" ? "numeric" : undefined} value={a} onChange={(e) => setA(e.target.value)} aria-label={FIELDS[field].label} placeholder={field === "shareClasses" ? "Authorized shares" : ""} />
      )}
      {field === "shareClasses" ? <input type="text" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} aria-label="Par value" placeholder="Par value (blank = no par)" /> : null}
      <button type="button" className="btn btn-small" onClick={save}>
        Save
      </button>
      <button type="button" className="btn btn-small btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

const EDITABLE: CompanyRecordField[] = ["entityType", "legalName", "delawareFileNumber", "incorporationDate", "shareClasses", "issuedShares", "founderStockIssueDate"];

export function DocumentFacts({ record, onChange, unverified = [] }: { record: CompanyRecord; onChange: Update; unverified?: CompanyRecordField[] }) {
  const [editing, setEditing] = useState<CompanyRecordField | null>(null);
  const fields = documentFields(record);
  const pending = fields.filter((f) => record[f].status === "needs_confirmation");
  if (fields.length === 0) return null;

  return (
    <div className="panel glass">
      <div className="panel-head">
        <div>
          <p className="eyebrow">From your documents</p>
          <h3>Check each value against its quote</h3>
        </div>
        {pending.length > 0 ? (
          <button type="button" className="btn btn-chrome" data-cursor="Confirm" onClick={() => onChange(confirmFields(record, pending))}>
            Confirm all {pending.length}
          </button>
        ) : (
          <span className="pill pill-ok">All confirmed</span>
        )}
      </div>
      <ul className="facts">
        {fields.map((field) => (
          <li key={field} className={`fact ${record[field].status === "confirmed" ? "is-confirmed" : ""}`}>
            <div className="fact-main">
              <span className="fact-label">{FIELDS[field].label}</span>
              {editing === field ? (
                <FieldEditor
                  record={record}
                  field={field}
                  onCancel={() => setEditing(null)}
                  onSave={(next) => {
                    onChange(next);
                    setEditing(null);
                  }}
                />
              ) : (
                <span className="fact-value">{displayValue(field, record)}</span>
              )}
              <Citation record={record} field={field} />
              {unverified.includes(field) ? <span className="warn-note">The quote didn't match the PDF text. Check this one carefully.</span> : null}
            </div>
            <div className="fact-actions">
              <span className={STATUS[record[field].status].className}>{STATUS[record[field].status].label}</span>
              {record[field].status === "needs_confirmation" ? (
                <button type="button" className="btn btn-small" onClick={() => onChange(confirmFields(record, [field]))}>
                  Confirm
                </button>
              ) : null}
              {EDITABLE.includes(field) && editing !== field ? (
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing(field)}>
                  Edit
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function YesNo({ value, onChange, allowUnsure = false }: { value: boolean | null; onChange: (v: boolean | null) => void; allowUnsure?: boolean }) {
  return (
    <div className="segmented" role="group">
      <button type="button" aria-pressed={value === true} onClick={() => onChange(true)}>
        Yes
      </button>
      <button type="button" aria-pressed={value === false} onClick={() => onChange(false)}>
        No
      </button>
      {allowUnsure ? (
        <button type="button" aria-pressed={value === null} onClick={() => onChange(null)}>
          Not sure
        </button>
      ) : null}
    </div>
  );
}

export function Questions({ record, onChange, founderHints = [] }: { record: CompanyRecord; onChange: Update; founderHints?: Array<{ name: string; pctOfExtractedShares: number }> }) {
  const [gross, setGross] = useState(record.grossAssets.value == null ? "" : String(record.grossAssets.value));
  const [founders, setFounders] = useState<Array<Founder & { residencyKnown: boolean }>>(() => {
    const existing = record.founders.value;
    if (existing && existing.length > 0) return existing.map((f) => ({ ...f, residencyKnown: true }));
    if (founderHints.length > 0) return founderHints.map((h) => ({ name: h.name, ownershipPct: h.pctOfExtractedShares, usTaxResident: true, residencyKnown: false }));
    return [{ name: "", ownershipPct: 100, usTaxResident: true, residencyKnown: false }];
  });
  const [states, setStates] = useState((record.statesWithOperations.value ?? []).join(", "));
  const [contractors, setContractors] = useState(() =>
    (record.contractorPaymentsByPayee.value ?? []).map((c) => ({ payee: c.payee, amount: String(c.totalPaidThisYear) })),
  );

  const grossNumber = Number(gross.replace(/[$,\s]/g, ""));
  const grossValid = gross.trim() !== "" && Number.isFinite(grossNumber) && grossNumber >= 0;
  const foundersValid = founders.length > 0 && founders.every((f) => f.name.trim() && f.residencyKnown && f.ownershipPct >= 0 && f.ownershipPct <= 100);

  const saved = (field: CompanyRecordField) => record[field].status === "confirmed";

  return (
    <div className="panel glass">
      <div className="panel-head">
        <div>
          <p className="eyebrow">A few questions</p>
          <h3>Things documents can't tell us</h3>
        </div>
      </div>

      <div className="q">
        <label className="q-label" htmlFor="gross">
          Gross assets at year end
          <span className="q-help">Total assets on your Form 1120, Schedule L. Not your bank or Stripe balance.</span>
        </label>
        <div className="q-row">
          <input id="gross" type="text" inputMode="decimal" placeholder="$50,000" value={gross} onChange={(e) => setGross(e.target.value)} />
          <button type="button" className="btn btn-small" disabled={!grossValid} onClick={() => onChange(setUserFact(record, "grossAssets", grossNumber))}>
            {saved("grossAssets") && record.grossAssets.value === grossNumber ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="q">
        <span className="q-label">
          Founders
          <span className="q-help">Residency decides whether Form 5472 applies. It never comes from documents.</span>
        </span>
        {founders.map((f, i) => (
          <div className="q-row founder" key={i}>
            <input type="text" placeholder="Name" value={f.name} onChange={(e) => setFounders(founders.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Founder name" />
            <input type="text" inputMode="decimal" className="narrow" value={String(f.ownershipPct)} onChange={(e) => setFounders(founders.map((x, j) => (j === i ? { ...x, ownershipPct: Number(e.target.value) || 0 } : x)))} aria-label="Ownership percent" />
            <span className="suffix">%</span>
            <div className="segmented" role="group" aria-label="US tax resident?">
              <button type="button" aria-pressed={f.residencyKnown && f.usTaxResident} onClick={() => setFounders(founders.map((x, j) => (j === i ? { ...x, usTaxResident: true, residencyKnown: true } : x)))}>
                US resident
              </button>
              <button type="button" aria-pressed={f.residencyKnown && !f.usTaxResident} onClick={() => setFounders(founders.map((x, j) => (j === i ? { ...x, usTaxResident: false, residencyKnown: true } : x)))}>
                Non-US
              </button>
            </div>
          </div>
        ))}
        <div className="q-row">
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setFounders([...founders, { name: "", ownershipPct: 0, usTaxResident: true, residencyKnown: false }])}>
            + Add founder
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={!foundersValid}
            onClick={() => onChange(setUserFact(record, "founders", founders.map(({ residencyKnown: _r, ...f }) => ({ ...f, name: f.name.trim() }))))}
          >
            {saved("founders") ? "Saved" : "Save founders"}
          </button>
        </div>
      </div>

      <div className="q">
        <span className="q-label">
          Did the company have transactions with its foreign owners this year?
          <span className="q-help">Capital contributions, loans and payments all count. This decides Form 5472.</span>
        </span>
        <YesNo
          allowUnsure
          value={record.hasReportableRelatedPartyTransactions.value}
          onChange={(v) => onChange(v === null ? clearFact(record, "hasReportableRelatedPartyTransactions") : setUserFact(record, "hasReportableRelatedPartyTransactions", v))}
        />
      </div>

      <div className="q">
        <label className="q-label" htmlFor="states">
          Operations in other states
          <span className="q-help">Employees, an office or other presence outside Delaware. Two-letter codes, or leave blank for none.</span>
        </label>
        <div className="q-row">
          <input id="states" type="text" placeholder="e.g. CA, NY" value={states} onChange={(e) => setStates(e.target.value.toUpperCase())} />
          <button
            type="button"
            className="btn btn-small"
            onClick={() => onChange(setUserFact(record, "statesWithOperations", states.split(/[\s,]+/).filter((s) => /^[A-Z]{2}$/.test(s) && s !== "DE")))}
          >
            {saved("statesWithOperations") ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="q">
        <span className="q-label">
          Contractors paid this year
          <span className="q-help">Anyone paid $2,000 or more in 2026 needs a 1099-NEC.</span>
        </span>
        {contractors.map((c, i) => (
          <div className="q-row" key={i}>
            <input type="text" placeholder="Payee" value={c.payee} onChange={(e) => setContractors(contractors.map((x, j) => (j === i ? { ...x, payee: e.target.value } : x)))} aria-label="Payee" />
            <input type="text" inputMode="decimal" placeholder="$ paid" value={c.amount} onChange={(e) => setContractors(contractors.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label="Amount paid" />
          </div>
        ))}
        <div className="q-row">
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setContractors([...contractors, { payee: "", amount: "" }])}>
            + Add contractor
          </button>
          <button
            type="button"
            className="btn btn-small"
            onClick={() =>
              onChange(
                setUserFact(
                  record,
                  "contractorPaymentsByPayee",
                  contractors
                    .filter((c) => c.payee.trim() && c.amount.trim())
                    .map((c) => ({ payee: c.payee.trim(), totalPaidThisYear: Number(c.amount.replace(/[$,\s]/g, "")) || 0 })),
                ),
              )
            }
          >
            {saved("contractorPaymentsByPayee") ? "Saved" : contractors.length === 0 ? "None" : "Save"}
          </button>
        </div>
      </div>

      <div className="q q-grid">
        <div>
          <span className="q-label">Formed with Stripe Atlas?</span>
          <YesNo value={record.atlasCompany.value} onChange={(v) => onChange(setUserFact(record, "atlasCompany", v ?? false))} />
        </div>
        <div>
          <span className="q-label">IRS-stamped 83(b) confirmation on file?</span>
          <YesNo value={record.has83bConfirmation.value} onChange={(v) => onChange(setUserFact(record, "has83bConfirmation", v ?? false))} />
        </div>
        <div>
          <span className="q-label">Amended authorized shares this year?</span>
          <YesNo value={record.amendedAuthorizedSharesThisYear.value} onChange={(v) => onChange(setUserFact(record, "amendedAuthorizedSharesThisYear", v ?? false))} />
        </div>
      </div>
    </div>
  );
}
