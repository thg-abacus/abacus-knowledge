# VCV Process Control

## The Process Control Form

The VCV Integration Process Control form in Oracle EPM controls whether the integration runs and tracks its execution status.

## Key Columns

| Column | Description |
|--------|-------------|
| `POV` | Point of View — the EPM scenario/version context |
| `Calculation` | Boolean: `true` = integration active, `false` = paused |
| `load_timestamp` | When the last data load occurred |

## How it's used

The MCP server queries this form via `list_forms` and `export_form_data` to:
1. Check if VCV is active (`Calculation = true`)
2. Get the last successful load timestamp
3. Determine which POV dimension combinations are available

## Example form data

```
POV: "Scenario:Actual; Version:Working; Year:FY26; Period:Jun"
Calculation: true
load_timestamp: "2026-06-16T08:30:00Z"
```

## Integration with ReconcilPro

ReconcilPro's Recruitment module consumes VCV data via:
1. `POST /api/epm/pull` (through the MCP proxy)
2. Parses CSV output using `parseSemicolonLine()`
3. Matches BegBalance vs YearTotal accumulators
