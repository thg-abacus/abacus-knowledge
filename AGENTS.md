# abacus-knowledge — Agent Guide

Knowledge RAG server para documentación del ecosistema ABACUS.
Permite indexar PDFs, Word, Excel, Markdown y texto, y consultarlos vía MCP tools.

**Stack:** TypeScript + MCP SDK + MiniSearch + pdfjs-dist + mammoth + exceljs
**Port:** 3003
**Package manager:** pnpm
**Start:** `pnpm dev` (stdio) | `pnpm dev:http` (HTTP)

## Knowledge routing priority (MANDATORY)

When answering ABACUS ecosystem questions, follow this ORDER:

1. **navigate_knowledge_tree** — structured docs: integrations, architecture, troubleshooting, runbooks. Try FIRST.
2. **MCP tools** (EPM, Sales) — live operational data: job status, sales data, integration dashboard.
3. **search_knowledge** (RAG) — LAST RESORT. Only for large PDFs/manuals that tree doesn't cover.

Never use search_knowledge for questions answered by the tree.

## Tree

```
tree/
├── manifest.yaml         ← Root map: AI reads this first to discover topics
├── integrations/         ← EPM integrations (VCV, PO, TRN)
│   ├── index.md
│   ├── vcv/              ← Vendor Cost Validation
│   ├── po/               ← Purchase Order
│   └── trn/              ← Transaction
├── architecture/         ← System design, data flow
└── runbooks/             ← Deploy, restart, emergency
```

## Tools MCP

| Tool | Priority | Description |
|------|----------|-------------|
| `navigate_knowledge_tree` | **1st** | Navigate structured doc tree — use FIRST for domain docs |
| `search_knowledge` | **3rd** | Full-text RAG search — only for large PDFs/Word when tree fails |
| `list_knowledge_docs` | — | List all indexed documents |
| `read_knowledge_doc` | — | Read full content of an indexed document |

## HTTP Endpoints (for humans)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Browser UI with upload + search |
| GET | `/search?q=` | Quick search JSON |
| GET | `/api/docs` | List indexed docs JSON |
| POST | `/upload` | Multipart file upload |
| POST | `/reindex` | Force re-index |

## Supported formats

`.pdf` `.docx` `.xlsx` `.xls` `.md` `.txt` `.csv` `.json` `.log`

## Config

```env
KNOWLEDGE_PORT=3003
KNOWLEDGE_DOCS_PATH=./docs
LOG_LEVEL=info
```

## Commit conventions

`feat:` `fix:` `refactor:` `docs:` `chore:`
