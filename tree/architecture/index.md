# System Architecture

## Ecosystem Overview

```
ABACUS Ecosystem
├── pbcs-mcp-server (:3001) — Oracle EPM Cloud MCP bridge
├── abacus-sales-mcp (:3002) — Sales data MCP server
├── abacus-knowledge (:3003) — RAG + docs
├── ABACUSapp (:3000) — Next.js reconciliation hub
├── reconcilpro (:3005) — React 19 reconciliation SPA
├── abacus-dashboard (:3456) — Architecture monitoring
├── PostgreSQL (:5432) — Main database
└── Sales DB (:5433) — Sales database
```
