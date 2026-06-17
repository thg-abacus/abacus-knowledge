# abacus-knowledge — Agent Guide

Knowledge RAG server para documentación del ecosistema ABACUS.
Permite indexar PDFs, Word, Excel, Markdown y texto, y consultarlos vía MCP tools.

**Stack:** TypeScript + MCP SDK + MiniSearch + pdfjs-dist + mammoth + exceljs
**Port:** 3003
**Package manager:** pnpm
**Start:** `pnpm dev` (stdio) | `pnpm dev:http` (HTTP)

## Tree

```
src/
├── index.ts              ← Entry point: load config → index → start server
├── config.ts             ← .env vars
├── indexer.ts            ← KnowledgeIndex: scan, parse, search
├── server.ts             ← MCP server + HTTP endpoints
├── tools/
│   ├── search.ts         ← search_knowledge
│   ├── list-docs.ts      ← list_knowledge_docs
│   └── read-doc.ts       ← read_knowledge_doc
└── utils/
    └── logger.ts         ← JSON logger

docs/                     ← Drop your PDF, Word, Excel, MD, TXT files here
```

## Tools MCP

| Tool | Params | Description |
|------|--------|-------------|
| `search_knowledge` | `query`, `limit?` | Full-text search with snippets and scores |
| `list_knowledge_docs` | — | List all indexed documents |
| `read_knowledge_doc` | `path` | Read full content of a document |

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
