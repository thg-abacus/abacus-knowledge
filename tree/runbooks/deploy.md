# Deployment Guide

## Quick start
```bash
cd abacus-platform && bash SETUP
bash START-ALL
```

## Services
| Service | Port | Command |
|---------|------|---------|
| EPM MCP | 3001 | `cd pbcs-mcp-server && pnpm dev:http` |
| Sales MCP | 3002 | `cd abacus-sales-mcp && npx tsx src/index.ts --port 3002` |
| ABACUSapp | 3000 | `cd ABACUSapp && npm run dev` |
| ReconcilPro | 3005 | `cd reconcilpro && npm run dev` |
| Dashboard | 3456 | `cd abacus-dashboard && node server.js` |
| Knowledge | 3003 | `cd abacus-knowledge && pnpm dev:http` |
