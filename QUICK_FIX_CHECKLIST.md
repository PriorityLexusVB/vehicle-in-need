# Quick Action Checklist: Fix Cloud Build SERVICE_URL Error

## The Problem
✗ Cloud Build trigger fails with: `invalid value for 'build.substitutions': key in the template "SERVICE_URL"`

## The Fix (5 minutes)

### Step 1: Open Google Cloud Console
- [ ] Navigate to https://console.cloud.google.com/cloud-build/triggers
- [ ] Select project: `gen-lang-client-0615287333`

### Step 2: Edit the Trigger
- [ ] Find trigger: `vehicle-in-need-deploy`
- [ ] Click the **EDIT** button (pencil icon)

### Step 3: Update Substitution Variables
- [ ] Scroll to **"Substitution variables"** section
- [ ] **Remove** any entry with key `SERVICE_URL` or `_SERVICE_URL`
- [ ] Verify these remain (optional, have defaults):
  - [ ] `_REGION`: `us-west1`
  - [ ] `_SERVICE`: `pre-order-dealer-exchange-tracker`

### Step 4: Save Changes
- [ ] Click **SAVE** at the bottom of the page
- [ ] Wait for confirmation message

### Step 5: Verify the Fix
- [ ] Run verification script:
  ```bash
  ./scripts/verify-cloud-build-config.sh
  ```
- [ ] Expected output: `🎉 Cloud Build trigger configuration is valid!`

### Step 6: Test the Build (Optional)
- [ ] Manual test build:
  ```bash
  gcloud builds submit --config cloudbuild.yaml \
    --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M)
  ```
- [ ] OR trigger via GitHub push to test

## Why This Works

✓ `SERVICE_URL` is a bash variable (not a substitution)  
✓ It's retrieved after Cloud Run deployment completes  
✓ Cloud Build substitutions must exist before the build starts  
✓ Only `_REGION` and `_SERVICE` are valid custom substitutions  

## Need Help?

- **Detailed guide**: See `CLOUD_BUILD_SERVICE_URL_FIX.md`
- **Troubleshooting**: See `README.md` troubleshooting section
- **PR summary**: See `PR_SUMMARY_SERVICE_URL_FIX.md`

## Questions?

**Q: Why can't SERVICE_URL be a substitution?**  
A: Because it doesn't exist until after deployment. It's dynamically retrieved using:
```bash
SERVICE_URL=$(gcloud run services describe ${_SERVICE} --region=${_REGION} --format='value(status.url)')
```

**Q: What substitutions ARE valid?**  
A: Only these:
- Built-in: `PROJECT_ID`, `SHORT_SHA`, `BUILD_ID` (automatic)
- Custom: `_REGION`, `_SERVICE` (must start with underscore)

**Q: Will removing SERVICE_URL break anything?**  
A: No! The repository code is already correct. It never needed to be a substitution.

---

**Last Updated**: 2025-11-18  
**Status**: ✅ Repository ready - awaiting manual trigger update
