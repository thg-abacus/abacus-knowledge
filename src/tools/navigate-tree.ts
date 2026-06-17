/**
 * Tool: navigate_knowledge_tree — navigate the structured doc tree.
 *
 * Reads manifest.yaml or a specific tree document.
 * Returns the content + suggests next available paths.
 */
import { z } from "zod";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join, extname } from "path";
import { parse as parseYaml } from "yaml";
import type { KnowledgeIndex } from "../indexer";

const TREE_ROOT: string = resolve(process.env.KNOWLEDGE_DOCS_PATH || "./docs", "..", "tree");

interface TreeNode {
  title: string;
  description?: string;
  intent?: string[];
  index?: string;
  children?: Record<string, TreeNode>;
  docs?: { path: string; title: string; intent?: string[] }[];
}

interface Manifest {
  tree: Record<string, TreeNode>;
}

function readNode(path: string): string | null {
  try { return readFileSync(path, "utf-8"); }
  catch { return null; }
}

export function navigateTree(index?: KnowledgeIndex) {
  return {
    name: "navigate_knowledge_tree",
    description:
      "PRIMARY knowledge source for ABACUS ecosystem docs. " +
      "Use this FIRST for any domain-specific question: integrations (VCV/PO/TRN), " +
      "architecture, troubleshooting, runbooks, deployment. " +
      "Call with path='manifest' to see the root map, then follow branches. " +
      "DO NOT use search_knowledge for questions answerable by the tree — the tree " +
      "returns complete, structured docs with zero inference needed.",
    schema: {
      path: z.string().default("manifest").describe(
        "Path to navigate: 'manifest' for the root map, or a branch path like 'integrations/vcv/index'"
      ),
    },
    handler: async (args: { path: string }) => {
      const reqPath = args.path || "manifest";

      // ── Manifest ──
      if (reqPath === "manifest" || reqPath === "") {
        const manifestPath = join(TREE_ROOT, "manifest.yaml");
        const content = readNode(manifestPath);
        if (!content) {
          return { content: [{ type: "text" as const, text: "Manifest not found. Tree docs are not yet configured." }] };
        }

        // Parse and summarize the tree — don't dump the whole YAML
        let manifest: Manifest;
        try { manifest = parseYaml(content) as Manifest; }
        catch { manifest = { tree: {} }; }

        const summary = Object.entries(manifest.tree).map(([key, node]) => {
          const childCount = node.children ? Object.keys(node.children).length : 0;
          const docCount = node.docs?.length || 0;
          return `📂 ${key}/ — ${node.title}\n   ${node.description || ""}\n   ${childCount} sub-branches, ${docCount} docs`;
        }).join("\n\n");

        const text = `# Knowledge Tree — Root\n\n${summary}\n\n` +
          `To explore a branch, call navigate_knowledge_tree with path like:\n` +
          Object.keys(manifest.tree).map(k => `  • ${k}/index`).join("\n");

        return { content: [{ type: "text" as const, text }] };
      }

      // ── Branch navigation ──
      const cleanPath = reqPath.replace(/\.(md|yaml)$/, "").replace(/\\/g, "/");
      const filePath = join(TREE_ROOT, cleanPath + ".md");
      const altPath = join(TREE_ROOT, cleanPath + ".yaml");

      let content = readNode(filePath) || readNode(altPath);
      if (!content) {
        // Suggest nearby files
        const dir = join(TREE_ROOT, cleanPath.includes("/") ? cleanPath.split("/").slice(0, -1).join("/") : cleanPath);
        try {
          const files = readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isFile() || e.isDirectory())
            .slice(0, 15)
            .map(e => `  • ${cleanPath}/${e.name}${e.isDirectory() ? "/" : ""}`);
          return {
            content: [{
              type: "text" as const,
              text: `Path not found: "${cleanPath}".md\n\nFiles in this directory:\n${files.join("\n") || "  (empty)"}\n\nTip: use navigate_knowledge_tree with path='manifest' to see the full tree.`,
            }],
          };
        } catch {
          return {
            content: [{
              type: "text" as const,
              text: `Path not found: "${cleanPath}".md\n\nUse path='manifest' to see available branches.`,
            }],
          };
        }
      }

      // Truncate huge files
      const truncated = content.length > 20000
        ? content.slice(0, 20000) + `\n\n[... ${content.length - 20000} more chars — use read_knowledge_doc for full content]`
        : content;

      return { content: [{ type: "text" as const, text: `📄 ${cleanPath}.md\n\n${truncated}` }] };
    },
  };
}
