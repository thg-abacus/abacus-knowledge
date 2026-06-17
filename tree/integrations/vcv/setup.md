# VCV Setup

## Prerequisites

1. Oracle EPM Cloud access with Planning role
2. EPM credentials configured in `pbcs-mcp-server/.env`:
   ```env
   EPM_BASE_URL=https://your-instance.epm.us6.oraclecloud.com
   EPM_USERNAME=identitydomain.username
   EPM_PASSWORD=***
   EPM_APP_NAME=YourApp
   ```

## Step 1: Create the VCV Job Definition

In Oracle EPM:
1. Navigate to **Application → Jobs**
2. Create new **Export Data** job
3. Name it: `EXPORT_VCV_DATA`
4. Configure export parameters to include VCV-related dimensions

## Step 2: Verify Process Control Form

```bash
# Using the MCP tool
list_forms → search for "VCV Integration Process Control"

# Expected result: form exists with active Calculation flag
```

## Step 3: Test the integration

```bash
# Submit and download via MCP
epm_pull_export_data → jobName: "EXPORT_VCV_DATA"

# Verify output
# Should produce a ZIP with CSV files containing VCV data
```

## Step 4: Configure ReconcilPro

In `reconcilpro/.env`:
```env
VITE_EPM_MCP_URL=http://localhost:3001
```

The Recruitment Reconciliation module will now be able to pull VCV data.
