# IAM Configuration Summary

## Overview

This document provides a comprehensive summary of the IAM configuration required for the Cloud Build and Cloud Run deployment pipeline for the `pre-order-dealer-exchange-tracker` service in project `gen-lang-client-0615287333`.

## Service Accounts

### 1. Cloud Build Service Account (Deployer)

**Email:** `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`

**Purpose:** Used by Cloud Build to build Docker images and deploy to Cloud Run.

**Required IAM Roles:**

| Role | Scope | Purpose |
|------|-------|---------|
| `roles/run.admin` | Project-level | Deploy and manage Cloud Run services |
| `roles/artifactregistry.writer` | Project-level | Push Docker images to Artifact Registry |
| `roles/cloudbuild.builds.editor` | Project-level | Manage Cloud Build jobs |
| `roles/iam.serviceAccountUser` | On runtime SA | Impersonate the runtime service account during deployment |

**Configuration Commands:**

```bash
# Project-level roles
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

# Service account impersonation
gcloud iam service-accounts add-iam-policy-binding \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=gen-lang-client-0615287333
```

### 2. Cloud Run Runtime Service Account

**Email:** `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`

**Purpose:** Used by the Cloud Run service at runtime to access GCP resources.

**Required IAM Roles:**

| Role | Scope | Purpose |
|------|-------|---------|
| `roles/logging.logWriter` | Project-level | Write logs to Cloud Logging |
| `roles/secretmanager.secretAccessor` | Secret-level | Access the `vehicle-in-need-gemini` secret at runtime |

**Configuration Commands:**

```bash
# Project-level role
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# Secret access
gcloud secrets add-iam-policy-binding vehicle-in-need-gemini \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=gen-lang-client-0615287333
```

**Note:** If the application requires access to additional GCP services (e.g., Firestore, Pub/Sub, Cloud Storage), grant only the necessary roles to this service account.

### 3. Default Compute Engine Service Account (Deprecated)

**Email:** `842946218691-compute@developer.gserviceaccount.com`

**Status:** ⚠️ **Should NOT be used for this Cloud Run service**

**Action Required:** Remove overly broad roles that are no longer needed.

**Roles to Review and Potentially Remove:**

| Role | Risk Level | Recommendation |
|------|------------|----------------|
| `roles/editor` | Critical | Remove if not needed by other services |
| `roles/run.admin` | High | Remove - the deployer SA should be used instead |
| `roles/iam.serviceAccountAdmin` | Critical | Remove if not needed |
| `roles/secretmanager.secretAccessor` | Medium | Remove - the runtime SA should be used instead |

**⚠️ CAUTION:** Before removing roles from the default compute service account, verify that no other services or workloads in the project depend on these permissions.

**Commands to Review Current Roles:**

```bash
# List all roles assigned to the default compute SA
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:842946218691-compute@developer.gserviceaccount.com" \
  --format="table(bindings.role)"
```

**Commands to Remove Roles (run only after verification):**

```bash
# Remove Editor role
gcloud projects remove-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:842946218691-compute@developer.gserviceaccount.com" \
  --role="roles/editor"

# Remove Cloud Run Admin
gcloud projects remove-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:842946218691-compute@developer.gserviceaccount.com" \
  --role="roles/run.admin"

# Remove Service Account Admin
gcloud projects remove-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:842946218691-compute@developer.gserviceaccount.com" \
  --role="roles/iam.serviceAccountAdmin"
```

## Cloud Build Configuration

The Cloud Build trigger (`vehicle-in-need-deploy`) must be configured to use the Cloud Build service account:

- **Service Account:** `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
- **Configuration File:** `cloudbuild.yaml` in the repository root
- **Repository:** `PriorityLexusVB/vehicle-in-need` (GitHub)

The `cloudbuild.yaml` file explicitly specifies the runtime service account in the deploy step:

```yaml
- name: gcr.io/google.com/cloudsdktool/cloud-sdk
  id: deploy-cloud-run
  entrypoint: gcloud
  args:
    - run
    - deploy
    - ${_SERVICE}
    - --image=us-west1-docker.pkg.dev/${PROJECT_ID}/vehicle-in-need/${_SERVICE}:${SHORT_SHA}
    - --region=${_REGION}
    - --service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com
    - --set-env-vars=NODE_ENV=production,APP_VERSION=${SHORT_SHA},BUILD_TIME=${BUILD_ID}
    - --update-secrets=API_KEY=vehicle-in-need-gemini:latest
```

## Setup Script

A setup script is provided at `scripts/setup-iam-permissions.sh` to automate the IAM configuration:

```bash
# Review changes (dry-run mode)
./scripts/setup-iam-permissions.sh

# Apply the IAM configuration
./scripts/setup-iam-permissions.sh --execute
```

The script will:
1. Grant all required permissions to the Cloud Build SA
2. Grant all required permissions to the runtime SA
3. Display commands to review and de-privilege the default compute SA

## Verification

After applying the IAM configuration, verify the setup:

```bash
# 1. Verify Cloud Build SA permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)"

# Expected output:
# - roles/run.admin
# - roles/artifactregistry.writer
# - roles/cloudbuild.builds.editor

# 2. Verify runtime SA permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)"

# Expected output:
# - roles/logging.logWriter

# 3. Verify impersonation permission
gcloud iam service-accounts get-iam-policy \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --project=gen-lang-client-0615287333

# Expected output should show:
# - cloud-build-deployer SA with roles/iam.serviceAccountUser

# 4. Verify secret access
gcloud secrets get-iam-policy vehicle-in-need-gemini --project=gen-lang-client-0615287333

# Expected output should show:
# - runtime SA with roles/secretmanager.secretAccessor
```

## Troubleshooting

### Error: Permission 'iam.serviceaccounts.actAs' denied

**Symptom:** Cloud Build fails with:
```
PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied on service account
```

**Root Cause:** The Cloud Build SA lacks `roles/iam.serviceAccountUser` permission on the runtime SA.

**Solution:**
```bash
gcloud iam service-accounts add-iam-policy-binding \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=gen-lang-client-0615287333
```

### Cloud Build trigger not using the correct service account

**Symptom:** Cloud Build trigger fails with permission errors or uses the wrong service account.

**Solution:** Verify the Cloud Build trigger configuration:
1. Go to Cloud Console → Cloud Build → Triggers
2. Find the `vehicle-in-need-deploy` trigger
3. Edit the trigger
4. In "Service account" section, select `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
5. Save the trigger

### Cloud Run service using the wrong runtime service account

**Symptom:** The Cloud Run service is not using the dedicated runtime SA.

**Solution:** Redeploy the service with the explicit `--service-account` flag:
```bash
gcloud run deploy pre-order-dealer-exchange-tracker \
  --image=us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest \
  --region=us-west1 \
  --service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com
```

## Security Considerations

1. **Least Privilege Principle:** Each service account has only the minimum permissions required for its function.

2. **Separation of Concerns:**
   - Build/Deploy operations use the Cloud Build SA
   - Runtime operations use the dedicated runtime SA
   - The default compute SA should not be used

3. **Audit Trail:** All deployment actions are logged with the Cloud Build SA identity, and all runtime actions are logged with the runtime SA identity.

4. **Secret Access:** Only the runtime SA has access to secrets at runtime. The Cloud Build SA does not need secret access (secrets are mounted by Cloud Run, not Cloud Build).

5. **No Project Owner/Editor:** Neither service account should have `roles/owner` or `roles/editor` at the project level.

## References

- [Cloud Run IAM Best Practices](https://cloud.google.com/run/docs/securing/service-identity)
- [Cloud Build Service Account Permissions](https://cloud.google.com/build/docs/securing-builds/configure-access-to-resources)
- [Principle of Least Privilege](https://cloud.google.com/iam/docs/using-iam-securely#least_privilege)
