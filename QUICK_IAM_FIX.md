# Quick IAM Fix - TL;DR

**Problem**: `PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied`

**Solution**: Grant IAM permissions to Cloud Build service account.

---

## 🚀 Quick Fix (5 minutes)

Run these commands from **Cloud Shell** or a terminal with `gcloud` authenticated:

### 1. Set Project

```bash
gcloud config set project gen-lang-client-0615287333
```

### 2. Verify Service Accounts Exist

```bash
# Check if both service accounts exist
gcloud iam service-accounts list \
  --project=gen-lang-client-0615287333 \
  --filter="email:(cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com OR pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com)" \
  --format="table(email)"
```

**If runtime SA is missing**, create it:

```bash
gcloud iam service-accounts create pre-order-dealer-exchange-860 \
  --project=gen-lang-client-0615287333 \
  --display-name="Pre-order Dealer Exchange Runtime"
```

### 3. Grant the Critical Permission (Fixes the Error)

```bash
# Grant Service Account User role (actAs permission)
gcloud iam service-accounts add-iam-policy-binding \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project="gen-lang-client-0615287333"
```

### 4. Grant Cloud Run Admin (If Not Already Granted)

```bash
# Grant Cloud Run Admin at project level
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

### 5. Grant Runtime Permissions

```bash
# Allow runtime SA to write logs
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# Allow runtime SA to access secrets
gcloud secrets add-iam-policy-binding vehicle-in-need-gemini \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=gen-lang-client-0615287333
```

### 6. Verify the Fix

```bash
# Check the critical actAs permission
gcloud iam service-accounts get-iam-policy \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --project="gen-lang-client-0615287333"
```

**Expected**: Should show `cloud-build-deployer@...` with `roles/iam.serviceAccountUser`

### 7. Test Deployment

```bash
# Trigger Cloud Build (option A: from repo directory)
cd /path/to/vehicle-in-need
gcloud builds submit --config cloudbuild.yaml \
  --substitutions SHORT_SHA=test-$(date +%Y%m%d-%H%M)

# OR trigger from GitHub Actions (option B)
# Just push to main branch or re-run the workflow
```

---

## ✅ Success Criteria

The deployment succeeds with all these steps passing:

```
✓ Check for conflict markers
✓ Build Docker image  
✓ Push image to Artifact Registry
✓ Deploy to Cloud Run ← This step should now work!
```

---

## 📝 Alternative: Use Automated Script

Instead of running commands individually:

```bash
# Clone repo and run setup script
git clone https://github.com/PriorityLexusVB/vehicle-in-need.git
cd vehicle-in-need

# Dry-run (shows what will be done)
./scripts/setup-iam-permissions.sh

# Execute
./scripts/setup-iam-permissions.sh --execute
```

---

## 🔍 Verify It Worked

After deployment completes:

```bash
# Check Cloud Run service
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format="value(spec.template.spec.serviceAccountName)"
```

**Expected**: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`

```bash
# Test the service
SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(status.url)')

curl -f "$SERVICE_URL/health"
```

**Expected**: `healthy`

---

## 📚 More Details

- **Complete Guide**: [IAM_FIX_EXECUTION_GUIDE.md](./IAM_FIX_EXECUTION_GUIDE.md)
- **IAM Architecture**: [IAM_CONFIGURATION_SUMMARY.md](./IAM_CONFIGURATION_SUMMARY.md)
- **Deployment Guide**: [CLOUD_RUN_DEPLOYMENT_RUNBOOK.md](./CLOUD_RUN_DEPLOYMENT_RUNBOOK.md)

---

## ❓ Still Not Working?

1. **Wait 1-2 minutes** for IAM changes to propagate
2. **Check for typos** in service account emails
3. **Verify Cloud Build trigger** uses `cloud-build-deployer` SA:
   ```bash
   gcloud builds triggers describe vehicle-in-need-deploy \
     --project=gen-lang-client-0615287333
   ```
4. **Review Cloud Build logs**: https://console.cloud.google.com/cloud-build/builds
5. **Check the detailed guide**: [IAM_FIX_EXECUTION_GUIDE.md](./IAM_FIX_EXECUTION_GUIDE.md)
