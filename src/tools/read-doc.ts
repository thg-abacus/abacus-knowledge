/**
 * Tool: read_knowledge_doc — read full content of a specific document.
 */
import { z } from "zod";
import type { KnowledgeIndex } from "../indexer";

export function readKnowledgeDoc(index: KnowledgeIndex) {
  return {
    name: "read_knowledge_doc",
    description: "Read the full text content of an indexed document by its path (as returned by search_knowledge or list_knowledge_docs).",
    schema: {
      path: z.string().describe("Document path as shown in search/list results (e.g. 'runbooks/deploy.md')"),
    },
    handler: async (args: { path: string }) => {
      const content = index.getDocContent(args.path);
      if (!content) {
        return {
          content: [{ type: "text" as const, text: `Document not found: "${args.path}". Use list_knowledge_docs to see available documents.` }],
        };
      }
      const truncated = content.length > 50000 ? content.slice(0, 50000) + "\n\n[Content truncated at 50K chars]" : content;
      return {
        content: [{ type: "text" as const, text: `📄 ${args.path}\n\n${truncated}` }],
      };
    },
  };
}
