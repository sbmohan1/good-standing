import { type CompanyRecord, type CompanyRecordField, deriveForeignOwnership, type Fact, lumenLabsRecord } from "@good-standing/core";

/**
 * The demo company as it would look right after extraction: document facts await the founder's
 * confirmation, and the founder's answers are filled in. One "Confirm all" gets you to the answer.
 */
export function demoRecord(): CompanyRecord {
  const record = structuredClone(lumenLabsRecord);
  for (const key of Object.keys(record) as CompanyRecordField[]) {
    const fact = record[key] as Fact<unknown>;
    if (fact.provenance?.kind === "document") (record[key] as Fact<unknown>) = { ...fact, status: "needs_confirmation" };
  }
  return record;
}

export function documentFields(record: CompanyRecord): CompanyRecordField[] {
  return (Object.keys(record) as CompanyRecordField[]).filter((k) => record[k].provenance?.kind === "document");
}

export function setUserFact<K extends CompanyRecordField>(record: CompanyRecord, key: K, value: CompanyRecord[K]["value"], detail?: string): CompanyRecord {
  const provenance = { kind: "user", answeredAt: new Date().toISOString(), ...(detail ? { detail } : {}) };
  const next = { ...record, [key]: { value, status: "confirmed", provenance } } as CompanyRecord;
  if (key === "founders") {
    const founders = next.founders.value ?? [];
    next.foreignOwnershipPct = { value: deriveForeignOwnership(founders).pct, status: "confirmed", provenance: next.founders.provenance };
  }
  return next;
}

export function clearFact(record: CompanyRecord, key: CompanyRecordField): CompanyRecord {
  return { ...record, [key]: { value: null, status: "missing" } } as CompanyRecord;
}

/** Confirm extracted values as-is, keeping their document citations. */
export function confirmFields(record: CompanyRecord, keys: CompanyRecordField[]): CompanyRecord {
  const next = { ...record };
  for (const key of keys) {
    const fact = next[key] as Fact<unknown>;
    if (fact.value !== null && fact.status === "needs_confirmation") (next[key] as Fact<unknown>) = { ...fact, status: "confirmed" };
  }
  return next;
}

export function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}
