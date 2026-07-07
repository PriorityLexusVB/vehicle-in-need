# Testing the GCP Authentication Fix

This document provides testing instructions to verify the authentication fallback fix works correctly.

## Test Scenarios

### Scenario 1: WIF Only (Primary Path)

**Setup:**

- Configure `GCP_WORKLOAD_IDENTITY_PROVIDER` secret
- Configure `GCP_SERVICE_ACCOUNT` secret
- Do NOT configure `GCP_SA_KEY` secret
- Ensure WIF pool and provider exist in GCP

**Expected Result:**

```
Validating GCP auth inputs...
Validating Workload Identity Federation credentials...
✅ GCP_WORKLOAD_IDENTITY_PROVIDER format is valid
✅ GCP_SERVICE_ACCOUNT format is valid
Will attempt Workload Identity Federation authentication
✅ Authenticated using Workload Identity Federation
```

**Status:** ✅ Should work if WIF is properly configured

**Note:** The above shows key output lines. Full output includes additional authentication step details.

---

### Scenario 2: WIF Fails, SA Key Fallback (Fix Target)

**Setup:**

- Configure `GCP_WORKLOAD_IDENTITY_PROVIDER` secret (with non-existent pool)
- Configure `GCP_SERVICE_ACCOUNT` secret
- Configure `GCP_SA_KEY` secret with valid service account JSON

**Expected Result:**

```
Validating GCP auth inputs...
Will attempt Workload Identity Federation authentication
Will use Service Account Key authentication
✅ Authenticated using Service Account Key
```

**Status:** ✅ This is the main fix - workflow continues instead of failing

---

### Scenario 3: SA Key Only

**Setup:**

- Do NOT configure `GCP_WORKLOAD_IDENTITY_PROVIDER` secret
- Do NOT configure `GCP_SERVICE_ACCOUNT` secret
- Configure `GCP_SA_KEY` secret

**Expected Result:**

```
Validating GCP auth inputs...
Will use Service Account Key authentication
✅ Authenticated using Service Account Key
```

**Status:** ✅ Direct SA key auth without attempting WIF

---

### Scenario 4: No Authentication Configured (Validation Failure)

**Setup:**

- Do NOT configure any GCP secrets

**Expected Result:**

```
Validating GCP auth inputs...
::error::No GCP authentication configured

Configure one of the following authentication methods:
  1. Workload Identity Federation (recommended):
     - GCP_WORKLOAD_IDENTITY_PROVIDER
     - GCP_SERVICE_ACCOUNT
  2. Service Account Key:
     - GCP_SA_KEY
```

**Status:** ✅ Clear error message with instructions

---

### Scenario 5: Both Methods Fail (All Auth Exhausted)

**Setup:**

- Configure invalid `GCP_WORKLOAD_IDENTITY_PROVIDER` (non-existent pool)
- Configure invalid `GCP_SA_KEY` (malformed JSON)

**Expected Result:**

```
Validating GCP auth inputs...
Will attempt Workload Identity Federation authentication
Will use Service Account Key authentication
::error::All authentication methods failed

Workload Identity Federation failed - the pool or provider may not exist or be disabled
To fix:
  1. Verify the pool and provider exist in GCP
  2. Or configure GCP_SA_KEY secret as a fallback
  3. See docs/CI.md for setup instructions

Service Account Key authentication failed - the key may be invalid or missing required permissions
To fix:
  1. Ensure the GCP_SA_KEY secret contains a valid service account key JSON
  2. Verify the service account has the necessary IAM roles (Cloud Build Editor, Artifact Registry Writer)
  3. See docs/CI.md for setup instructions
```

**Status:** ✅ Clear error message explaining the problem

---

## Manual Testing Steps

### Option A: Test in GitHub Actions

1. **Trigger a workflow run:**

   ```
   Go to: Actions → Build and Push Container (Cloud Build) → Run workflow
   Branch: copilot/fix-action-job-issues
   Leave "deploy" unchecked
   Click "Run workflow"
   ```

2. **Monitor the authentication steps:**
   - "Validate GCP auth inputs" - Should pass
   - "Authenticate to Google Cloud (Workload Identity Federation)" - May fail
   - "Authenticate to Google Cloud (Service Account Key)" - Should succeed (if configured)
   - "Check authentication status" - Should report success with SA key

3. **Verify subsequent steps run:**
   - "Set up Cloud SDK" - Should run
   - "Configure Docker for Artifact Registry" - Should run
   - "Submit build to Cloud Build" - Should run

### Option B: Test Workflow Locally (Dry Run)

Cannot fully test authentication locally, but can validate YAML syntax:

```bash
# Install act (GitHub Actions local runner)
# https://github.com/nektos/act

# Validate workflow syntax
act -l --workflow .github/workflows/build-and-deploy.yml

# Dry run (will fail at auth step, but validates structure)
act --dryrun
```

---

## Expected Behavior Changes

### Before Fix

- ❌ Workflow fails immediately when WIF auth fails
- ❌ No fallback mechanism
- ❌ Error message is cryptic (`invalid_target`)
- ❌ Workflow cannot proceed even if SA key is available

### After Fix

- ✅ Workflow tries WIF, then falls back to SA key
- ✅ Build continues if any auth method succeeds
- ✅ Clear error messages explaining what failed
- ✅ Actionable troubleshooting guidance

---

## Verification Checklist

After testing, verify:

- [ ] Workflow validates both authentication methods correctly
- [ ] WIF is attempted first (if configured)
- [ ] SA key fallback works when WIF fails
- [ ] Clear success message indicates which method was used
- [ ] Build/deploy steps execute after successful authentication
- [ ] Error messages are clear and actionable when both methods fail
- [ ] No secrets are exposed in logs
- [ ] Workflow completes successfully with fallback auth

---

## Troubleshooting Test Failures

### Test fails at validation step

- Check that secrets are correctly configured in repository settings
- Verify secret names match exactly (case-sensitive)

### WIF auth step hangs or times out

- This is normal if the pool doesn't exist
- Workflow should automatically proceed to SA key step

### SA key auth fails

- Verify the JSON is complete and valid
- Check that the service account has required permissions
- Ensure the project ID in the JSON matches the target project

### Build fails after successful auth

- This is unrelated to the auth fix
- Check build logs for specific error messages
- May be related to Cloud Build configuration or Dockerfile issues

---

## Success Criteria

The fix is successful if:

1. ✅ Workflow no longer fails with `invalid_target` error
2. ✅ SA key fallback works when WIF is unavailable
3. ✅ Build can proceed with either authentication method
4. ✅ Error messages guide users to resolution
5. ✅ No security vulnerabilities introduced (CodeQL clean)

---

## Additional Notes

- **Security:** SA key authentication should only be used as a fallback or temporary solution
- **Recommendation:** Configure proper WIF for production use
- **Monitoring:** Check workflow runs regularly to ensure auth is working
- **Rotation:** If using SA keys, rotate them every 90 days

---

## Related Documentation

- `GCP_AUTH_FIX.md` - Complete fix summary
- `docs/CI.md` - Full authentication setup guide
- `.github/workflows/build-and-deploy.yml` - Updated workflow file
