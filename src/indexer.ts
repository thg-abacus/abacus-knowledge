/**
 * indexer.ts — Document indexing for the ABACUS Knowledge Server.
 *
 * Scans a docs directory, parses supported formats (PDF, Word, Excel, Markdown, TXT),
 * and builds a MiniSearch full-text index.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { basename, extname, join } from "path";
import MiniSearch from "minisearch";
import { setLogLevel, logger } from "./utils/logger";

// ── Lazy imports for heavy parsers (only loaded when needed) ──

async function parsePdf(filePath: string): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(filePath));
  const doc = await getDocument({ data, disableAutoFetch: true, disableStream: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str || "").join(" ");
    pages.push(text);
  }
  return pages.join("\n");
}

async function parseDocx(filePath: string): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function parseXlsx(filePath: string): Promise<string> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheets: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[] = [];
    sheet.eachRow((row) => {
      const vals = (row.values as Array<unknown>).slice(1); // skip 1-indexed null
      rows.push(vals.map((v) => String(v ?? "")).join("\t"));
    });
    if (rows.length) sheets.push(`[Sheet: ${sheet.name}]\n${rows.join("\n")}`);
  });
  return sheets.join("\n\n");
}

function parseText(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

// ── Supported extensions ──

const PARSERS: Record<string, (path: string) => Promise<string>> = {
  ".pdf": parsePdf,
  ".docx": parseDocx,
  ".xlsx": parseXlsx,
  ".xls": parseXlsx,
  ".md": (p) => Promise.resolve(parseText(p)),
  ".txt": (p) => Promise.resolve(parseText(p)),
  ".csv": (p) => Promise.resolve(parseText(p)),
  ".json": (p) => Promise.resolve(parseText(p)),
  ".log": (p) => Promise.resolve(parseText(p)),
};

function isSupported(ext: string): boolean {
  return ext.toLowerCase() in PARSERS;
}

// ── Document record ──

export interface IndexedDoc {
  id: string;        // file path relative to docs dir
  fileName: string;
  ext: string;
  size: number;
  indexedAt: string; // ISO timestamp
  snippet?: string;  // populated on search
}

// ── MiniSearch field config ──

const MINISEARCH_OPTS = {
  fields: ["fileName", "content"],
  storeFields: ["fileName", "ext", "size", "indexedAt", "snippet"],
  searchOptions: {
    boost: { fileName: 2 },
    prefix: true,
    fuzzy: 0.2,
  },
};

// ── Main Indexer ──

export class KnowledgeIndex {
  private index: MiniSearch;
  private docs: Map<string, IndexedDoc> = new Map(); // id → doc
  private docsPath: string;

  constructor(docsPath: string) {
    this.docsPath = docsPath;
    this.index = new MiniSearch(MINISEARCH_OPTS);
  }

  /** Scan and index all supported files in docsPath */
  async build(): Promise<{ indexed: number; errors: string[] }> {
    const errors: string[] = [];
    const files = this.scanFiles(this.docsPath);

    for (const filePath of files) {
      const ext = extname(filePath).toLowerCase();
      const parser = PARSERS[ext];
      if (!parser) continue;

      try {
        const content = await parser(filePath);
        const stat = statSync(filePath);
        const relPath = filePath.replace(this.docsPath, "").replace(/^[\\/]/, "");
        const doc: IndexedDoc = {
          id: relPath,
          fileName: basename(filePath),
          ext,
          size: stat.size,
          indexedAt: new Date().toISOString(),
        };

        // Remove old entry if re-indexing
        if (this.docs.has(relPath)) {
          this.index.remove({ id: relPath });
        }

        this.index.add({ id: relPath, fileName: doc.fileName, content });
        // Store full doc metadata separately (MiniSearch storeFields is limited)
        (doc as any).content = content; // keep for read_doc
        this.docs.set(relPath, doc);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${basename(filePath)}: ${msg}`);
        logger.warn(`Failed to index ${basename(filePath)}: ${msg}`);
      }
    }

    logger.info(`Indexed ${this.docs.size} document(s) from "${this.docsPath}"`);
    if (errors.length) {
      logger.warn(`${errors.length} file(s) failed indexing`);
    }
    return { indexed: this.docs.size, errors };
  }

  /** Full-text search */
  search(query: string, limit = 10): { doc: IndexedDoc; score: number; snippet: string }[] {
    const results = this.index.search(query, { ...MINISEARCH_OPTS.searchOptions });
    return results.slice(0, limit).map((r) => {
      const doc = this.docs.get(r.id)!;
      // Generate a snippet around the first match
      const content = (doc as any).content as string || "";
      const lower = content.toLowerCase();
      const qLower = query.toLowerCase();
      const idx = lower.indexOf(qLower);
      const start = idx >= 0 ? Math.max(0, idx - 80) : 0;
      const end = Math.min(content.length, start + 300);
      const snippet = (start > 0 ? "…" : "") + content.slice(start, end).replace(/\s+/g, " ").trim() + (end < content.length ? "…" : "");

      return {
        doc: { ...doc, snippet },
        score: r.score,
        snippet,
      };
    });
  }

  /** Get full document content by path */
  getDocContent(relativePath: string): string | null {
    const doc = this.docs.get(relativePath);
    if (!doc) return null;
    return (doc as any).content as string || null;
  }

  /** List all indexed documents */
  listDocs(): IndexedDoc[] {
    return Array.from(this.docs.values()).map((d) => ({
      id: d.id,
      fileName: d.fileName,
      ext: d.ext,
      size: d.size,
      indexedAt: d.indexedAt,
    }));
  }

  get docCount(): number {
    return this.docs.size;
  }

  // ── Helpers ──

  private scanFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.scanFiles(full));
        } else if (entry.isFile() && isSupported(extname(entry.name))) {
          results.push(full);
        }
      }
    } catch {
      // Directory might not exist yet
    }
    return results;
  }
}
