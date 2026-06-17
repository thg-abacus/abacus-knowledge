/**
 * server.ts — MCP Knowledge Server with HTTP upload/search endpoints.
 *
 * Dual-protocol:
 *   MCP Streamable HTTP → for AI agents to query via tools
 *   REST HTTP           → for humans to upload and search via browser
 */
import http from "http";
import { readFileSync, createReadStream, existsSync, mkdirSync, writeFileSync, statSync, readdirSync } from "fs";
import { basename, extname, join, resolve } from "path";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { KnowledgeIndex } from "./indexer";
import { searchKnowledge } from "./tools/search";
import { listKnowledgeDocs } from "./tools/list-docs";
import { readKnowledgeDoc } from "./tools/read-doc";
import { navigateTree } from "./tools/navigate-tree";
import { logger } from "./utils/logger";

const MAX_UPLOAD_MB = 50;

const FRIENDLY_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ABACUS Knowledge</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{max-width:600px;width:100%;padding:40px;border:1px solid #30363d;border-radius:12px;background:#161b22}
    h1{font-size:22px;margin-bottom:4px}
    .sub{color:#8b949e;font-size:14px;margin-bottom:24px}
    .section{margin-bottom:20px}
    .section h2{font-size:14px;color:#58a6ff;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}
    .dropzone{border:2px dashed #30363d;border-radius:8px;padding:30px;text-align:center;cursor:pointer;transition:all .2s}
    .dropzone:hover,.dropzone.dragover{border-color:#58a6ff;background:rgba(88,166,255,.05)}
    .dropzone p{color:#8b949e;font-size:13px}
    .dropzone .icon{font-size:28px;margin-bottom:8px}
    input[type=text]{width:100%;padding:10px 14px;border:1px solid #30363d;border-radius:8px;background:#0d1117;color:#e6edf3;font-size:14px;outline:none}
    input[type=text]:focus{border-color:#58a6ff}
    ul{list-style:none;margin-top:8px}
    li{padding:6px 0;font-size:13px;color:#8b949e;border-bottom:1px solid #21262d;display:flex;justify-content:space-between}
    li:last-child{border-bottom:none}
    .status{color:#3fb950;font-weight:600;font-size:14px}
    .endpoints{font-size:12px;color:#8b949e;margin-top:20px;padding-top:16px;border-top:1px solid #21262d}
    .endpoints code{color:#58a6ff;background:#0d1117;padding:1px 6px;border-radius:4px}
    button{padding:10px 20px;border:none;border-radius:8px;background:#238636;color:#fff;font-size:14px;cursor:pointer;margin-top:8px}
    button:hover{background:#2ea043}
    #searchResults{margin-top:8px}
    .result{padding:8px 12px;margin:4px 0;background:#0d1117;border-radius:6px;font-size:13px}
    .result .name{color:#58a6ff;font-weight:600}
    .result .snippet{color:#8b949e;font-size:12px;margin-top:2px}
  </style>
</head>
<body>
<div class="card">
  <h1>📚 ABACUS Knowledge</h1>
  <p class="sub">Upload, index, and search your ABACUS ecosystem documentation.</p>

  <div class="section">
    <h2>🔍 Search</h2>
    <input type="text" id="q" placeholder="Search docs..." onkeydown="if(event.key==='Enter')search()">
    <div id="searchResults"></div>
    <h2 style="margin-top:16px">📋 Indexed Docs</h2>
    <ul id="docList"><li>Loading...</li></ul>
  </div>

  <div class="section">
    <h2>📤 Upload</h2>
    <div class="dropzone" id="dropzone">
      <div class="icon">📁</div>
      <p>Drop PDF, Word, Excel, Markdown, TXT files here<br>(max ${MAX_UPLOAD_MB}MB)</p>
    </div>
    <div id="uploadStatus"></div>
  </div>

  <div class="endpoints">
    <p>MCP Streamable HTTP <code>POST /</code> &nbsp;|&nbsp; REST <code>GET /search?q=</code> &nbsp;|&nbsp; <code>POST /upload</code></p>
    <p id="status" class="status">● Connected</p>
  </div>
</div>
<script>
  async function loadDocList(){const r=await fetch("/api/docs");const d=await r.json();const u=document.getElementById("docList");u.innerHTML=d.length?d.map(x=>'<li><span>📄 '+x.fileName+'</span><span style="font-size:11px">'+x.ext+' · '+(x.size/1024).toFixed(1)+'KB</span></li>').join(''):'<li>No documents indexed yet.</li>'}
  async function search(){const q=document.getElementById("q").value;if(!q)return;const r=await fetch("/search?q="+encodeURIComponent(q));const d=await r.json();const u=document.getElementById("searchResults");u.innerHTML=d.length?d.map(x=>'<div class="result"><div class="name">📄 '+x.fileName+'</div><div class="snippet">'+x.snippet+'</div></div>').join(''):'<div class="result">No results.</div>'}
  const drop=document.getElementById("dropzone");drop.ondragover=e=>{e.preventDefault();drop.classList.add("dragover")};drop.ondragleave=()=>drop.classList.remove("dragover");drop.ondrop=async e=>{e.preventDefault();drop.classList.remove("dragover");for(const f of e.dataTransfer.files){const fd=new FormData();fd.append("file",f);const r=await fetch("/upload",{method:"POST",body:fd});const d=await r.json();document.getElementById("uploadStatus").innerHTML+='<p style="font-size:12px;color:'+(r.ok?"#3fb950":"#f85149")+'">'+(r.ok?"✓":"✗")+' '+d.fileName+': '+(d.message||d.error)+'</p>'}loadDocList()}
  loadDocList();
</script>
</body>
</html>`;

export async function startServer(index: KnowledgeIndex, port: number): Promise<void> {
  // ── MCP Server ──
  const mcpServer = new McpServer({ name: "abacus-knowledge", version: "1.0.0" });

  const tools = [
    searchKnowledge(index),
    listKnowledgeDocs(index),
    readKnowledgeDoc(index),
    navigateTree(index),
  ];

  for (const t of tools) {
    mcpServer.tool(t.name, t.description, t.schema, t.handler);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await mcpServer.connect(transport);

  // ── HTTP Server ──
  const httpServer = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const { method, url } = req;
    const parsedUrl = url ? new URL(url, `http://localhost:${port}`) : null;
    const pathname = parsedUrl?.pathname || "/";

    // ── Friendly page ──
    if (method === "GET" && (pathname === "/" || pathname === "")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(FRIENDLY_PAGE);
      return;
    }

    // ── REST search for humans ──
    if (method === "GET" && pathname === "/search") {
      const q = parsedUrl?.searchParams.get("q") || "";
      if (!q) { res.writeHead(400); res.end(JSON.stringify({ error: "Missing ?q=" })); return; }
      const results = index.search(q, 15);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(results.map((r) => ({
        fileName: r.doc.fileName,
        path: r.doc.id,
        ext: r.doc.ext,
        snippet: r.snippet,
        score: Math.round(r.score * 100),
      }))));
      return;
    }

    // ── List docs API ──
    if (method === "GET" && pathname === "/api/docs") {
      const docs = index.listDocs().map((d) => ({
        fileName: d.fileName,
        ext: d.ext,
        size: d.size,
        path: d.id,
        indexedAt: d.indexedAt,
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(docs));
      return;
    }

    // ── Upload ──
    if (method === "POST" && pathname === "/upload") {
      const contentType = req.headers["content-type"] || "";
      if (!contentType.includes("multipart/form-data")) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Use multipart/form-data" }));
        return;
      }
      const boundary = contentType.split("boundary=")[1];
      if (!boundary) { res.writeHead(400); res.end(JSON.stringify({ error: "Missing boundary" })); return; }

      const chunks: Buffer[] = [];
      for await (const ch of req) chunks.push(ch as Buffer);
      const raw = Buffer.concat(chunks).toString("binary");
      const parts = raw.split(`--${boundary}`);
      let uploaded = 0;

      for (const part of parts) {
        if (!part.includes("Content-Disposition") || !part.includes("filename=")) continue;
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd === -1) continue;
        const header = part.slice(0, headerEnd);
        const nameMatch = header.match(/filename="([^"]+)"/);
        if (!nameMatch) continue;
        const fileName = nameMatch[1];
        const fileData = Buffer.from(part.slice(headerEnd + 4).replace(/\r\n--$/, "").replace(/--$/, ""), "binary");

        if (fileData.length > MAX_UPLOAD_MB * 1024 * 1024) {
          res.writeHead(413);
          res.end(JSON.stringify({ error: `File exceeds ${MAX_UPLOAD_MB}MB limit` }));
          return;
        }

        const safeName = basename(fileName).replace(/[<>:"/\\|?*]/g, "_");
        const destPath = join(index["docsPath"] ?? "./docs", safeName);
        writeFileSync(destPath, fileData);
        uploaded++;
      }

      if (uploaded > 0) {
        // Re-index
        const result = await index.build();
        logger.info(`Re-indexed after upload: ${result.indexed} docs`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: `Uploaded and re-indexed. ${result.indexed} total docs.` }));
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "No valid files found in upload" }));
      }
      return;
    }

    // ── Tree navigator (structured docs) ──
    if (method === "GET" && pathname === "/tree/manifest") {
      const manifestPath = join(process.cwd(), "tree", "manifest.yaml");
      if (existsSync(manifestPath)) {
        res.writeHead(200, { "Content-Type": "text/yaml; charset=utf-8" });
        createReadStream(manifestPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end("Manifest not configured yet. Create tree/manifest.yaml");
      }
      return;
    }

    if (method === "GET" && pathname.startsWith("/tree/")) {
      const treePath = pathname.replace("/tree/", "").replace(/\.\./g, "").replace(/\\/g, "/");
      const fullPath = join(process.cwd(), "tree", treePath + ".md");
      if (existsSync(fullPath)) {
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
        createReadStream(fullPath).pipe(res);
        return;
      }
      // Try without .md extension (directory listing)
      const dirPath = join(process.cwd(), "tree", treePath);
      if (existsSync(dirPath)) {
        try {
          const entries = readdirSync(dirPath, { withFileTypes: true });
          const listing = entries
            .filter(e => !e.name.startsWith("."))
            .map(e => `${e.isDirectory() ? "📂" : "📄"} /tree/${treePath}/${e.name}${e.isDirectory() ? "/" : ""}`)
            .join("\n");
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(listing || "(empty directory)");
          return;
        } catch {}
      }
      res.writeHead(404);
      res.end(`Not found: ${treePath}.md\nUse /tree/manifest to explore.`);
      return;
    }

    // ── Re-index ──
    if (method === "POST" && pathname === "/reindex") {
      const result = await index.build();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: `Re-indexed ${result.indexed} document(s).` }));
      return;
    }

    // ── MCP Streamable HTTP (everything else) ──
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      logger.error(`HTTP transport error: ${(err as Error).message}`);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  logger.info(`📚 ABACUS Knowledge Server running on http://localhost:${port}`);
  logger.info(`   MCP Streamable HTTP:  POST http://localhost:${port}/`);
  logger.info(`   Browser UI:           http://localhost:${port}/`);
  logger.info(`   Upload:               http://localhost:${port}/upload`);
  logger.info(`   Search:               http://localhost:${port}/search?q=`);
  logger.info(`   Indexed:              ${index.docCount} document(s)`);
}
