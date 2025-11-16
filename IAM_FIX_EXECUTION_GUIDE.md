# Cloud Run IAM Permissions - Execution Guide

**Problem**: Cloud Build deployment fails with `PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied on service account pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`

**Solution**: Grant required IAM permissions to allow Cloud Build service account to deploy Cloud Run services using the runtime service account.

---

## Prerequisites

**Environment**: This must be executed from a networked environment with GCP access:
- Google Cloud Shell (recommended)
- Local terminal with `gcloud` CLI authenticated

**Required Permissions**:
- Owner or Security Admin role on project `gen-lang-client-0615287333`

**Authentication**:
```bash
gcloud auth login
gcloud config set project gen-lang-client-0615287333
```

---

## Step 1: Verify Service Accounts Exist

Before granting permissions, confirm both service accounts exist:

```bash
# List all service accounts in the project
gcloud iam service-accounts list \
  --project=gen-lang-client-0615287333 \
  --format="table(email,displayName)"
```

### Expected Service Accounts

You should see at least these two service accounts:

1. **Cloud Build Deployer SA** (for building and deploying):
   - Email: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
   - Display Name: "Cloud Build Deployer" or similar

2. **Runtime SA** (for Cloud Run service execution):
   - Email: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
   - Display Name: "Pre-order Dealer Exchange Runtime" or similar

### If Runtime Service Account Does NOT Exist

Create it with:

```bash
gcloud iam service-accounts create pre-order-dealer-exchange-860 \
  --project=gen-lang-client-0615287333 \
  --display-name="Pre-order Dealer Exchange Runtime" \
  --description="Runtime service account for pre-order-dealer-exchange-tracker Cloud Run service"
```

Verify creation:

```bash
gcloud iam service-accounts describe \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --project=gen-lang-client-0615287333
```

---

## Step 2: Grant Service Account User Role (actAs Permission)

This is the **critical permission** that fixes the `iam.serviceaccounts.actAs` error:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project="gen-lang-client-0615287333"
```

**What this does**: Allows the Cloud Build SA to deploy Cloud Run services using the runtime SA's identity.

### Verify the Binding

```bash
gcloud iam service-accounts get-iam-policy \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --project="gen-lang-client-0615287333" \
  --format="table(bindings.role, bindings.members)"
```

**Expected Output**: You should see a row with:
- Role: `roles/iam.serviceAccountUser`
- Member: `serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`

---

## Step 3: Grant Cloud Run Admin Role

Ensure the Cloud Build SA has permission to deploy Cloud Run services:

```bash
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

**What this does**: Allows the Cloud Build SA to create, update, and manage Cloud Run services.

### Verify Cloud Build SA Permissions

```bash
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role, bindings.members)"
```

**Expected Roles** (at minimum):
- `roles/run.admin`
- `roles/artifactregistry.writer` (should already exist)
- `roles/cloudbuild.builds.editor` (should already exist)

---

## Step 4: Grant Runtime Service Account Permissions

The runtime SA needs permissions to access secrets and write logs:

### 4.1 Grant Log Writer Role

```bash
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

### 4.2 Grant Secret Manager Access

```bash
gcloud secrets add-iam-policy-binding vehicle-in-need-gemini \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=gen-lang-client-0615287333
```

### Verify Runtime SA Permissions

```bash
# Check project-level permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role, bindings.members)"

# Check secret access
gcloud secrets get-iam-policy vehicle-in-need-gemini \
  --project=gen-lang-client-0615287333 \
  --format="table(bindings.role, bindings.members)"
```

**Expected Runtime SA Permissions**:
- Project-level: `roles/logging.logWriter`
- Secret-level: `roles/secretmanager.secretAccessor` on `vehicle-in-need-gemini`

---

## Step 5: Verify cloudbuild.yaml Configuration

The `cloudbuild.yaml` file should already have the correct configuration. Verify it contains:

```yaml
- name: gcr.io/google.com/cloudsdktool/cloud-sdk
  id: deploy-cloud-run
  entrypoint: gcloud
  args:
    - run
    - deploy
    - pre-order-dealer-exchange-tracker
    - --image=us-west1-docker.pkg.dev/${PROJECT_ID}/vehicle-in-need/pre-order-dealer-exchange-tracker:${SHORT_SHA}
    - --region=us-west1
    - --platform=managed
    - --allow-unauthenticated
    - --service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com
    - --set-env-vars=NODE_ENV=production,APP_VERSION=${SHORT_SHA},BUILD_TIME=${BUILD_ID}
    - --update-secrets=API_KEY=vehicle-in-need-gemini:latest
```

**Key items to verify**:
- ✅ `--service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com` is present
- ✅ Region is `us-west1`
- ✅ Image path uses `us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:${SHORT_SHA}`
- ✅ Secrets are configured: `--update-secrets=API_KEY=vehicle-in-need-gemini:latest`

---

## Step 6: Test the Deployment

Now that IAM permissions are configured, test the deployment:

### Option A: Trigger Cloud Build from GitHub

1. Push a commit to `main` branch (or re-run existing workflow)
2. The GitHub Actions workflow will submit the build to Cloud Build
3. Monitor the build:

```bash
# List recent builds
gcloud builds list --limit=5

# Stream logs for a specific build
gcloud builds log <BUILD_ID> --stream
```

### Option B: Manual Cloud Build Submission

From the repository directory:

```bash
# Get current commit SHA
export SHORT_SHA=$(git rev-parse --short=7 HEAD)

# Submit build
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions SHORT_SHA=${SHORT_SHA},_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker \
  --project=gen-lang-client-0615287333
```

### Expected Result

The build should complete all steps successfully:
1. ✅ Check for conflict markers
2. ✅ Build Docker image
3. ✅ Push image to Artifact Registry (both `SHORT_SHA` and `latest` tags)
4. ✅ **Deploy to Cloud Run** (this previously failed with `iam.serviceaccounts.actAs` error)

---

## Step 7: Verify Cloud Run Deployment

After successful deployment, verify the service:

```bash
# Get service details
gcloud run services describe pre-order-dealer-exchange-tracker \
  --project=gen-lang-client-0615287333 \
  --region=us-west1 \
  --format="table(metadata.name,status.url,spec.template.spec.serviceAccountName)"
```

**Expected Output**:
- `metadata.name`: `pre-order-dealer-exchange-tracker`
- `status.url`: `https://pre-order-dealer-exchange-tracker-<hash>-uw.a.run.app`
- `spec.template.spec.serviceAccountName`: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`

### Health Check

```bash
SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(status.url)')

echo "Service URL: $SERVICE_URL"

# Test health endpoint
curl -f "$SERVICE_URL/health"
```

**Expected**: `healthy`

### Status API Check

```bash
curl -s "$SERVICE_URL/api/status" | jq '.'
```

**Expected Output**:
```json
{
  "status": "healthy",
  "geminiEnabled": true,
  "version": "<commit-sha>",
  "buildTime": "<timestamp>",
  "nodeVersion": "v20.x.x",
  "environment": "production",
  "timestamp": "<iso-timestamp>",
  "uptime": <seconds>
}
```

---

## Complete IAM Configuration Summary

After completing all steps, the IAM configuration should be:

### Cloud Build SA (`cloud-build-deployer@...`)

**Project-Level Roles**:
- `roles/run.admin` - Deploy Cloud Run services
- `roles/artifactregistry.writer` - Push Docker images
- `roles/cloudbuild.builds.editor` - Manage builds

**Service Account-Level Binding**:
- `roles/iam.serviceAccountUser` on `pre-order-dealer-exchange-860@...` - Deploy as runtime SA

### Runtime SA (`pre-order-dealer-exchange-860@...`)

**Project-Level Roles**:
- `roles/logging.logWriter` - Write logs to Cloud Logging

**Secret-Level Bindings**:
- `roles/secretmanager.secretAccessor` on `vehicle-in-need-gemini` - Access API key at runtime

---

## Troubleshooting

### Error: Service Account Does Not Exist

**Symptom**: 
```
ERROR: (gcloud.iam.service-accounts.add-iam-policy-binding) NOT_FOUND: Unknown service account
```

**Solution**: Create the service account first (see Step 1)

### Error: Permission Denied When Granting Roles

**Symptom**:
```
ERROR: (gcloud.projects.add-iam-policy-binding) PERMISSION_DENIED
```

**Solution**: Ensure you have Owner or Security Admin role on the project:
```bash
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:$(gcloud config get-value account)"
```

### Build Still Fails After IAM Fix

**Symptom**: Build continues to fail even after IAM permissions are granted

**Possible Causes**:
1. Typo in service account email in `cloudbuild.yaml`
2. IAM changes not yet propagated (wait 1-2 minutes)
3. Cloud Build trigger not using correct service account

**Verification**:
```bash
# Check Cloud Build trigger configuration
gcloud builds triggers describe vehicle-in-need-deploy \
  --project=gen-lang-client-0615287333

# Verify it uses: cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com
```

---

## Alternative: Use Automated Script

Instead of running commands individually, use the provided IAM setup script:

```bash
# Clone the repository
git clone https://github.com/PriorityLexusVB/vehicle-in-need.git
cd vehicle-in-need

# Review what the script will do (dry-run)
./scripts/setup-iam-permissions.sh

# Execute the IAM configuration
./scripts/setup-iam-permissions.sh --execute
```

The script automates Steps 2, 3, and 4 above.

---

## What Changed Summary

For the PR/issue comment:

```markdown
### IAM Permissions Fix Summary

**Problem Resolved**: Fixed `PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied` error during Cloud Build deployment.

**IAM Bindings Added**:

1. **Service Account User Role** (actAs permission):
   - Granted `roles/iam.serviceAccountUser` on `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
   - To: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
   - Purpose: Allows Cloud Build to deploy Cloud Run services using the runtime service account

2. **Cloud Run Admin Role**:
   - Granted `roles/run.admin` at project level
   - To: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
   - Purpose: Allows Cloud Build to create and manage Cloud Run services

3. **Runtime Service Account Permissions**:
   - Granted `roles/logging.logWriter` at project level to runtime SA
   - Granted `roles/secretmanager.secretAccessor` on `vehicle-in-need-gemini` secret to runtime SA
   - Purpose: Allows Cloud Run service to write logs and access API keys at runtime

**Configuration Files**:
- `cloudbuild.yaml` - Already correctly configured with `--service-account` flag
- No code changes required - issue was purely IAM permissions

**Verification**:
- ✅ Cloud Build can now deploy to Cloud Run
- ✅ Cloud Run service uses dedicated runtime service account
- ✅ Service can access secrets and write logs
- ✅ Latest build completed successfully

**Next Steps**:
- Monitor Cloud Build deployments to ensure consistent success
- Review and de-privilege default compute SA if needed (see IAM_CONFIGURATION_SUMMARY.md)
```

---

## Related Documentation

- [IAM_CONFIGURATION_SUMMARY.md](./IAM_CONFIGURATION_SUMMARY.md) - Detailed IAM architecture
- [CLOUD_RUN_DEPLOYMENT_RUNBOOK.md](./CLOUD_RUN_DEPLOYMENT_RUNBOOK.md) - Complete deployment guide
- [scripts/setup-iam-permissions.sh](./scripts/setup-iam-permissions.sh) - Automated IAM setup script
- [IAM_VALIDATION_CHECKLIST.md](./IAM_VALIDATION_CHECKLIST.md) - Validation steps

---

## Support

If issues persist after following this guide:

1. Check IAM propagation - wait 2-3 minutes after granting permissions
2. Review Cloud Build logs: `https://console.cloud.google.com/cloud-build/builds`
3. Verify Cloud Build trigger uses correct service account
4. Check for typos in service account emails in `cloudbuild.yaml`
5. Ensure all prerequisite roles exist on both service accounts
