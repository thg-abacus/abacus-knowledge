# VCV Troubleshooting

## Common errors

### 1. "Failed to submit job"

**Cause:** EPM credentials invalid or expired.
**Fix:** Verify `EPM_USERNAME` format is `identitydomain.user` and password hasn't expired.

### 2. "Job status: Error" (status code 1)

**Cause:** Job definition misconfigured in EPM.
**Fix:** Check job parameters in EPM UI — verify export file name and dimension selections.

### 3. "No files extracted from ZIP"

**Cause:** Export job completed but ZIP was empty or corrupted.
**Fix:** 
1. Download the ZIP manually from EPM UI
2. Check file contents — should contain CSV files
3. Verify exportFileName matches job configuration

### 4. "CSV headers don't match expected format"

**Cause:** EPM export configuration changed or data shape differs.
**Fix:**
1. Compare exported CSV headers against ReconcilPro's expected headers
2. Update `file-type-detector.ts` if a new file type is introduced

### 5. "Process Control form not found"

**Cause:** Form name changed or was deleted in EPM.
**Fix:**
1. Search for alternative form names: `list_forms` with partial name
2. If renamed, update the query in MCP tool documentation
3. If deleted, recreate from EPM backup

## Debug checklist

- [ ] `integration_dashboard` shows the job
- [ ] `data_exchange_log` has entries for the timestamp
- [ ] `list_documents` shows the exported ZIP
- [ ] Port 3001 is responding: `curl http://localhost:3001`
- [ ] EPM mode is set correctly: `EPM_MODE=live`
