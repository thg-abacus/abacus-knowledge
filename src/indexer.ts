/**
 * indexer.ts — Chunked document indexing for the ABACUS Knowledge Server.
 *
 * Scans a docs directory, parses supported formats (PDF, Word, Excel, Markdown, TXT),
 * splits content into overlapping chunks, and builds a MiniSearch full-text index.
 *
 * Why chunking: a 300 MB Word doc would flood the AI context.
 * With chunking (~2000 chars each), only the most relevant chunks are returned.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { basename, extname, join } from "path";
import MiniSearch from "minisearch";
import { logger } from "./utils/logger";

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
      const vals = (row.values as Array<unknown>).slice(1);
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

// ── Chunking ──

/**
 * Split text into overlapping chunks for indexing.
 * Overlap ensures no content is lost at chunk boundaries.
 *
 * @param text    The full document text
 * @param size    Target chunk size in characters (default 2000)
 * @param overlap Overlap between adjacent chunks (default 200)
 * @returns Array of chunk strings
 */
function chunkText(text: string, size = 2000, overlap = 200): string[] {
  if (text.length <= size) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    // Try to break at a sentence/paragraph boundary within the last 25% of the chunk
    const end = Math.min(start + size, text.length);
    let breakAt = end;

    if (end < text.length) {
      // Search backwards from end for a natural break point
      const searchWindow = text.slice(Math.max(start, end - Math.floor(size * 0.25)), end);
      const lastNewline = searchWindow.lastIndexOf("\n\n");
      const lastPeriod = searchWindow.lastIndexOf(". ");
      const lastNewlineSingle = searchWindow.lastIndexOf("\n");

      if (lastNewline !== -1) {
        breakAt = Math.max(start, end - Math.floor(size * 0.25)) + lastNewline + 2;
      } else if (lastPeriod !== -1) {
        breakAt = Math.max(start, end - Math.floor(size * 0.25)) + lastPeriod + 2;
      } else if (lastNewlineSingle !== -1) {
        breakAt = Math.max(start, end - Math.floor(size * 0.25)) + lastNewlineSingle + 1;
      }
    }

    chunks.push(text.slice(start, breakAt).trim());
    start = breakAt - overlap;
    if (start <= 0 || start >= text.length) break;
    if (chunks.length > 100000) break; // safety limit
  }

  return chunks.filter((c) => c.length > 50); // skip tiny fragments
}

// ── Document & chunk records ──

export interface IndexedDoc {
  id: string;        // relative path from docs/
  fileName: string;
  ext: string;
  size: number;      // original file size in bytes
  indexedAt: string;
  chunkCount: number;
  snippet?: string;
}

interface ChunkEntry {
  chunkId: string;   // "relPath#0"
  docId: string;     // "relPath"
  fileName: string;
  content: string;
}

// ── MiniSearch config ──

const MINISEARCH_OPTS = {
  fields: ["fileName", "content"],
  storeFields: ["fileName", "content"],
  searchOptions: {
    boost: { fileName: 2 },
    prefix: true,
    fuzzy: 0.2,
  },
};

// ── Main Indexer ──

export class KnowledgeIndex {
  private index: MiniSearch;
  private docs: Map<string, IndexedDoc & { chunkContents: string[] }> = new Map();
  private docsPath: string;

  constructor(docsPath: string) {
    this.docsPath = docsPath;
    this.index = new MiniSearch(MINISEARCH_OPTS);
  }

  /** Scan, parse, chunk, and index all supported files */
  async build(): Promise<{ indexed: number; errors: string[] }> {
    const errors: string[] = [];
    const files = this.scanFiles(this.docsPath);

    for (const filePath of files) {
      const ext = extname(filePath).toLowerCase();
      const parser = PARSERS[ext];
      if (!parser) continue;

      try {
        const rawContent = await parser(filePath);
        const stat = statSync(filePath);
        const relPath = filePath.replace(this.docsPath, "").replace(/^[\\/]/, "");

        // Remove old chunks for this file if re-indexing
        this.removeDocument(relPath);

        // Chunk the content
        const chunks = chunkText(rawContent, 2000, 200);
        if (chunks.length === 0) {
          logger.warn(`Skipping ${relPath}: no content after chunking`);
          continue;
        }

        // Index each chunk separately
        for (let i = 0; i < chunks.length; i++) {
          const chunkId = `${relPath}#${i}`;
          this.index.add({
            id: chunkId,
            fileName: basename(filePath),
            content: chunks[i],
          });
        }

        // Store doc metadata + chunks
        this.docs.set(relPath, {
          id: relPath,
          fileName: basename(filePath),
          ext,
          size: stat.size,
          indexedAt: new Date().toISOString(),
          chunkCount: chunks.length,
          chunkContents: chunks,
        });

        logger.debug(`Indexed ${relPath}: ${chunks.length} chunks`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${basename(filePath)}: ${msg}`);
        logger.warn(`Failed to index ${basename(filePath)}: ${msg}`);
      }
    }

    logger.info(`Indexed ${this.docs.size} document(s) (${this.totalChunks} chunks) from "${this.docsPath}"`);
    if (errors.length) {
      logger.warn(`${errors.length} file(s) failed indexing`);
    }
    return { indexed: this.docs.size, errors };
  }

  /**
   * Search indexed chunks, deduplicate by document, return top results.
   *
   * Strategy: get top N results from MiniSearch, group by document,
   * concatenate their snippets, and return one result per document.
   */
  search(query: string, limit = 5): { doc: IndexedDoc; score: number; snippet: string }[] {
    const rawResults = this.index.search(query, {
      ...MINISEARCH_OPTS.searchOptions,
    });

    // Group by document, keep best chunk per doc
    const byDoc = new Map<string, { chunkId: string; score: number; content: string }[]>();
    for (const r of rawResults) {
      const hashIdx = r.id.lastIndexOf("#");
      const docId = hashIdx >= 0 ? r.id.slice(0, hashIdx) : r.id;
      if (!byDoc.has(docId)) byDoc.set(docId, []);
      byDoc.get(docId)!.push({ chunkId: r.id, score: r.score, content: r.content as string || "" });
    }

    // Build results: one per document, best snippet + score
    const results: { doc: IndexedDoc; score: number; snippet: string }[] = [];
    for (const [docId, chunks] of byDoc) {
      const doc = this.docs.get(docId);
      if (!doc) continue;

      // Sort chunks by score descending
      chunks.sort((a, b) => b.score - a.score);
      const bestScore = chunks[0].score;

      // Build a snippet from the top 2 chunks (max 600 chars total)
      const topChunks = chunks.slice(0, 2).map((c) => c.content.trim());
      const snippet = topChunks.join(" … ").slice(0, 600).replace(/\s+/g, " ").trim();

      results.push({
        doc: {
          id: doc.id,
          fileName: doc.fileName,
          ext: doc.ext,
          size: doc.size,
          indexedAt: doc.indexedAt,
          chunkCount: doc.chunkCount,
          snippet,
        },
        score: bestScore,
        snippet: snippet + (topChunks.join(" … ").length > 600 ? "…" : ""),
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /** Get full content of a document by concatenating all its chunks */
  getDocContent(relativePath: string): string | null {
    const doc = this.docs.get(relativePath);
    if (!doc) return null;

    const fullText = doc.chunkContents.join("\n\n");
    if (fullText.length <= 50000) return fullText;

    // For huge docs, return first 25K + last 25K with a marker
    const head = fullText.slice(0, 25000);
    const tail = fullText.slice(-25000);
    return head + `\n\n… [${fullText.length - 50000} chars skipped] …\n\n` + tail;
  }

  /** List all indexed documents */
  listDocs(): IndexedDoc[] {
    return Array.from(this.docs.values()).map((d) => ({
      id: d.id,
      fileName: d.fileName,
      ext: d.ext,
      size: d.size,
      indexedAt: d.indexedAt,
      chunkCount: d.chunkCount,
    }));
  }

  get docCount(): number {
    return this.docs.size;
  }

  get totalChunks(): number {
    let total = 0;
    for (const d of this.docs.values()) total += d.chunkCount;
    return total;
  }

  // ── Helpers ──

  /** Remove a document and all its chunks from the index */
  private removeDocument(relPath: string) {
    const existing = this.docs.get(relPath);
    if (existing) {
      for (let i = 0; i < existing.chunkCount; i++) {
        this.index.remove({ id: `${relPath}#${i}` });
      }
    }
    this.docs.delete(relPath);
  }

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
