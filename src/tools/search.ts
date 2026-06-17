/**
 * Tool: search_knowledge — search indexed documents.
 */
import { z } from "zod";
import type { KnowledgeIndex } from "../indexer";

export function searchKnowledge(index: KnowledgeIndex) {
  return {
    name: "search_knowledge",
    description: "Full-text search across indexed ABACUS documentation (PDF, Word, Excel, Markdown, TXT). Returns snippets, document paths, and relevance scores.",
    schema: {
      query: z.string().describe("Search query — natural language or keywords"),
      limit: z.number().optional().default(10).describe("Max results (default: 10)"),
    },
    handler: async (args: { query: string; limit?: number }) => {
      const results = index.search(args.query, args.limit || 10);
      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No results found for "${args.query}".` }],
        };
      }
      const text = results.map((r) =>
        `📄 ${r.doc.fileName} (score: ${(r.score * 100).toFixed(0)}%)\n` +
        `   Path: ${r.doc.id}\n` +
        `   Type: ${r.doc.ext} | Size: ${formatSize(r.doc.size)}\n` +
        `   Snippet: "${r.snippet}"\n`
      ).join("\n");
      return {
        content: [{ type: "text" as const, text: `Found ${results.length} result(s):\n\n${text}` }],
      };
    },
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
