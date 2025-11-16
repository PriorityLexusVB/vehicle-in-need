# IAM Fix Execution Checklist

Use this checklist to track progress when applying the IAM permissions fix.

---

## Pre-Execution Checklist

- [ ] I have access to Google Cloud Shell or a terminal with gcloud CLI
- [ ] I have Owner or Security Admin role on project `gen-lang-client-0615287333`
- [ ] I have authenticated with gcloud: `gcloud auth login`
- [ ] I have set the correct project: `gcloud config set project gen-lang-client-0615287333`
- [ ] I have reviewed the documentation:
  - [ ] `QUICK_IAM_FIX.md` - For quick command reference
  - [ ] `IAM_FIX_EXECUTION_GUIDE.md` - For detailed walkthrough
  - [ ] `IAM_FIX_SUMMARY.md` - For understanding the changes

---

## Execution Checklist

### Step 1: Verify Service Accounts

- [ ] Listed service accounts to confirm they exist:
  ```bash
  gcloud iam service-accounts list --project=gen-lang-client-0615287333
  ```
- [ ] Confirmed Cloud Build SA exists: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
- [ ] Confirmed Runtime SA exists: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
- [ ] If Runtime SA missing, created it:
  ```bash
  gcloud iam service-accounts create pre-order-dealer-exchange-860 \
    --project=gen-lang-client-0615287333 \
    --display-name="Pre-order Dealer Exchange Runtime"
  ```

### Step 2: Grant Service Account User Role (Critical!)

- [ ] Granted `roles/iam.serviceAccountUser` permission:
  ```bash
  gcloud iam service-accounts add-iam-policy-binding \
    pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
    --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --project="gen-lang-client-0615287333"
  ```
- [ ] Verified the binding was created:
  ```bash
  gcloud iam service-accounts get-iam-policy \
    pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
    --project="gen-lang-client-0615287333"
  ```
- [ ] Confirmed output shows Cloud Build SA with `roles/iam.serviceAccountUser`

### Step 3: Grant Cloud Run Admin Role

- [ ] Granted Cloud Run Admin at project level:
  ```bash
  gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
    --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
    --role="roles/run.admin"
  ```
- [ ] Verified Cloud Build SA permissions:
  ```bash
  gcloud projects get-iam-policy gen-lang-client-0615287333 \
    --flatten="bindings[].members" \
    --filter="bindings.members:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
    --format="table(bindings.role)"
  ```
- [ ] Confirmed `roles/run.admin` is present

### Step 4: Grant Runtime Service Account Permissions

- [ ] Granted Log Writer role:
  ```bash
  gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
    --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
    --role="roles/logging.logWriter"
  ```
- [ ] Granted Secret Manager access:
  ```bash
  gcloud secrets add-iam-policy-binding vehicle-in-need-gemini \
    --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=gen-lang-client-0615287333
  ```
- [ ] Verified runtime SA permissions:
  ```bash
  gcloud projects get-iam-policy gen-lang-client-0615287333 \
    --flatten="bindings[].members" \
    --filter="bindings.members:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
    --format="table(bindings.role)"
  ```
- [ ] Confirmed `roles/logging.logWriter` is present

### Step 5: Wait for IAM Propagation

- [ ] Waited 1-2 minutes for IAM changes to propagate

---

## Testing Checklist

### Test 1: Verify cloudbuild.yaml Configuration

- [ ] Opened `cloudbuild.yaml` in the repository
- [ ] Confirmed line 82 has: `--service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
- [ ] Confirmed image path is: `us-west1-docker.pkg.dev/${PROJECT_ID}/vehicle-in-need/pre-order-dealer-exchange-tracker:${SHORT_SHA}`
- [ ] Confirmed region is: `us-west1`

### Test 2: Trigger Cloud Build

**Method A - Manual Cloud Build Submission**:
- [ ] Cloned/navigated to repository:
  ```bash
  cd /path/to/vehicle-in-need
  ```
- [ ] Submitted build:
  ```bash
  gcloud builds submit --config cloudbuild.yaml \
    --substitutions SHORT_SHA=test-$(date +%Y%m%d-%H%M) \
    --project=gen-lang-client-0615287333
  ```
- [ ] Monitored build logs

**Method B - GitHub Actions**:
- [ ] Pushed commit to `main` branch or re-ran workflow
- [ ] Monitored at: https://github.com/PriorityLexusVB/vehicle-in-need/actions

### Test 3: Verify Build Success

- [ ] Confirmed all build steps passed:
  - [ ] ✅ Check for conflict markers
  - [ ] ✅ Build Docker image
  - [ ] ✅ Push image to Artifact Registry (SHORT_SHA tag)
  - [ ] ✅ Push image to Artifact Registry (latest tag)
  - [ ] ✅ Deploy to Cloud Run ← **Previously failed, should now succeed**

### Test 4: Verify Cloud Run Deployment

- [ ] Got service description:
  ```bash
  gcloud run services describe pre-order-dealer-exchange-tracker \
    --region=us-west1 \
    --project=gen-lang-client-0615287333 \
    --format="table(metadata.name,status.url,spec.template.spec.serviceAccountName)"
  ```
- [ ] Confirmed service account is: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
- [ ] Confirmed service URL is populated

### Test 5: Health Check

- [ ] Retrieved service URL:
  ```bash
  SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
    --region=us-west1 \
    --project=gen-lang-client-0615287333 \
    --format='value(status.url)')
  echo "Service URL: $SERVICE_URL"
  ```
- [ ] Tested health endpoint:
  ```bash
  curl -f "$SERVICE_URL/health"
  ```
- [ ] Confirmed response: `healthy`

### Test 6: Status API Check

- [ ] Tested status API:
  ```bash
  curl -s "$SERVICE_URL/api/status" | jq '.'
  ```
- [ ] Verified response contains:
  - [ ] `"status": "healthy"`
  - [ ] `"geminiEnabled": true`
  - [ ] `"version"`: (commit SHA)
  - [ ] `"environment": "production"`

---

## Post-Execution Checklist

### Documentation

- [ ] Saved command outputs for reference
- [ ] Documented any issues encountered and resolutions
- [ ] Updated team on successful IAM fix

### Optional: De-privilege Default Compute SA

⚠️ Only do this if you're certain no other services depend on these permissions

- [ ] Reviewed current default compute SA permissions:
  ```bash
  gcloud projects get-iam-policy gen-lang-client-0615287333 \
    --flatten="bindings[].members" \
    --filter="bindings.members:842946218691-compute@developer.gserviceaccount.com"
  ```
- [ ] Identified permissions to remove (if any)
- [ ] Removed unnecessary roles (see `IAM_CONFIGURATION_SUMMARY.md` for commands)

### Monitoring

- [ ] Set up monitoring for Cloud Build deployment success rate
- [ ] Added alerts for Cloud Run service health
- [ ] Scheduled periodic IAM audit reviews

---

## Troubleshooting

If issues occurred, check the following:

### Build Still Failing?

- [ ] Waited 2-3 minutes for IAM propagation
- [ ] Verified no typos in service account emails
- [ ] Checked Cloud Build trigger uses correct SA:
  ```bash
  gcloud builds triggers describe vehicle-in-need-deploy \
    --project=gen-lang-client-0615287333
  ```
- [ ] Reviewed Cloud Build logs: https://console.cloud.google.com/cloud-build/builds

### Permission Errors?

- [ ] Confirmed I have Owner/Security Admin role
- [ ] Checked current permissions:
  ```bash
  gcloud projects get-iam-policy gen-lang-client-0615287333 \
    --flatten="bindings[].members" \
    --filter="bindings.members:$(gcloud config get-value account)"
  ```

### Service Not Responding?

- [ ] Checked Cloud Run logs:
  ```bash
  gcloud run services logs read pre-order-dealer-exchange-tracker \
    --region=us-west1 \
    --project=gen-lang-client-0615287333 \
    --limit=50
  ```
- [ ] Verified secrets are accessible
- [ ] Checked for startup errors

---

## Completion

- [ ] All IAM permissions successfully applied
- [ ] Cloud Build deployment succeeded
- [ ] Cloud Run service is healthy and responding
- [ ] Team notified of successful fix
- [ ] Documentation reviewed and understood

**Date Completed**: ___________________

**Completed By**: ___________________

**Build ID (successful)**: ___________________

**Cloud Run Service URL**: ___________________

**Notes**:
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________

---

## Quick Reference

**Most Important Command** (Fixes the actAs error):
```bash
gcloud iam service-accounts add-iam-policy-binding \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project="gen-lang-client-0615287333"
```

**Automated Approach**:
```bash
cd /path/to/vehicle-in-need
./scripts/setup-iam-permissions.sh --execute
```

**Documentation**:
- Quick Start: `QUICK_IAM_FIX.md`
- Detailed Guide: `IAM_FIX_EXECUTION_GUIDE.md`
- Summary: `IAM_FIX_SUMMARY.md`
- This Checklist: `IAM_FIX_CHECKLIST.md`
