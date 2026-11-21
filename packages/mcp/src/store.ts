import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { type CompanyRecord, CompanyRecordSchema, emptyRecord } from "@good-standing/core";

/**
 * The company record lives in a local file the founder controls: ./.good-standing/record.json
 * (or $GOOD_STANDING_HOME/record.json). Nothing is sent anywhere except PDFs during extraction.
 */
export interface RecordStore {
  readonly path: string;
  load(): Promise<CompanyRecord>;
  save(record: CompanyRecord): Promise<void>;
  exists(): Promise<boolean>;
}

export class RecordFileError extends Error {
  override name = "RecordFileError";
}

export function defaultStoreDir(): string {
  return process.env.GOOD_STANDING_HOME ?? path.join(process.cwd(), ".good-standing");
}

export function fileRecordStore(dir: string = defaultStoreDir()): RecordStore {
  const file = path.join(dir, "record.json");
  return {
    path: file,

    async exists() {
      try {
        await readFile(file);
        return true;
      } catch {
        return false;
      }
    },

    async load() {
      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyRecord();
        throw error;
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new RecordFileError(`${file} isn't valid JSON. Fix or delete it; Good Standing won't overwrite it.`);
      }
      // Fill fields added in later versions, then validate.
      const parsed = CompanyRecordSchema.safeParse({ ...emptyRecord(), ...(json as object) });
      if (!parsed.success) {
        throw new RecordFileError(`${file} doesn't match the record schema. Fix or delete it; Good Standing won't overwrite it.`);
      }
      return parsed.data;
    },

    async save(record) {
      const valid = CompanyRecordSchema.parse(record);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      // Belt and braces: keep the record out of git even if the repo's .gitignore misses it.
      await writeFile(path.join(dir, ".gitignore"), "*\n", { mode: 0o600 });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(valid, null, 2)}\n`, { mode: 0o600 });
      await rename(tmp, file);
    },
  };
}

/** In-memory store for tests. */
export function memoryRecordStore(initial?: CompanyRecord): RecordStore & { saved: number } {
  let record: CompanyRecord | undefined = initial ? structuredClone(initial) : undefined;
  const store = {
    path: "(memory)",
    saved: 0,
    async exists() {
      return record !== undefined;
    },
    async load() {
      return structuredClone(record ?? emptyRecord());
    },
    async save(next: CompanyRecord) {
      record = structuredClone(CompanyRecordSchema.parse(next));
      store.saved++;
    },
  };
  return store;
}
