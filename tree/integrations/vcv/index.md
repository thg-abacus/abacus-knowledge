# VCV — Vendor Cost Validation

## Overview

VCV (Vendor Cost Validation) is the primary cost reconciliation integration. It validates vendor costs loaded into Oracle EPM against source system data.

## Process Control Form

- **Form name:** `"VCV Integration Process Control"`
- **Key columns:** `POV`, `Calculation`, `load_timestamp`
- **Location:** Found via `list_forms` tool with the query above

## How to check VCV status

```typescript
// Via MCP tool
integration_dashboard → look for VCV job entries

// Via direct API
GET /api/epm/pull  with jobName matching VCV export
```

## Data structure

Exported CSV headers follow the pattern:
```
begbalance, yeartotal, functionCode, currency, costItem, project, ...
```

## Common issues

- **Empty export:** Check that the Process Control form has `Calculation = true`
- **Stale data:** Verify `load_timestamp` is recent (within last 24h)
- **Header mismatch:** Confirm the CSV matches expected column order
