# EPM Integrations — Hub

This section covers all Oracle EPM Cloud data integrations used in the ABACUS ecosystem.

## Available integrations

| Integration | Query for `list_forms` | Description |
|-------------|----------------------|-------------|
| VCV | `"VCV Integration Process Control"` | Vendor Cost Validation |
| PO | `"PO Integration Process Control"` | Purchase Order |
| TRN | `"TRN Integration Process Control"` | Transaction |

## How they work

Each integration follows the same pattern:
1. A Job runs in Oracle EPM to export data
2. The MCP server polls for completion (via `integration_dashboard`)
3. Extracted CSVs are served from the `uploads/` directory
4. ReconcilPro consumes them for reconciliation

## Key EPM API endpoints

- `POST /HyperionPlanning/rest/v3/applications/{app}/jobs` — Submit export job
- `GET  /HyperionPlanning/rest/v3/applications/{app}/jobs/{id}` — Poll job status

## Troubleshooting flow

If an integration fails:
1. Check `integration_dashboard` for job status
2. Look at `data_exchange_log` for error details (use `fullContent: true`)
3. Verify the integration's Process Control Form is active in EPM
4. Check CSV output format matches expected headers
