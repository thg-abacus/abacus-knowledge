/**
 * Tool: list_knowledge_docs — list all indexed documents.
 */
import type { KnowledgeIndex } from "../indexer";

export function listKnowledgeDocs(index: KnowledgeIndex) {
  return {
    name: "list_knowledge_docs",
    description: "List all documents currently indexed in the ABACUS Knowledge base. Returns file names, types, sizes, and index dates.",
    schema: {},
    handler: async () => {
      const docs = index.listDocs();
      if (docs.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No documents indexed. Drop files in the docs/ directory or upload via http://localhost:3003" }],
        };
      }
      const text = docs.map((d) =>
        `📄 ${d.fileName} | ${d.ext} | ${formatSize(d.size)} | indexed: ${d.indexedAt}`
      ).join("\n");
      return {
        content: [{ type: "text" as const, text: `${docs.length} document(s) indexed:\n\n${text}` }],
      };
    },
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
