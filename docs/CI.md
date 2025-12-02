# CI/CD Configuration for GCP Workload Identity Federation

This document describes how to configure the required GitHub repository secrets for the Build-and-Deploy workflow (`.github/workflows/build-and-deploy.yml`) which uses GCP Workload Identity Federation for authentication.

## Overview

The CI/CD workflow uses Google Cloud Workload Identity Federation for secure authentication. This approach eliminates the need for long-lived service account keys, which improves security by:

- Removing the risk of key leakage
- Automatically expiring credentials
- Providing fine-grained access control per repository

## Required Repository Secrets

The following secrets must be configured in your GitHub repository (Settings → Secrets and variables → Actions):

| Secret Name | Description | Required |
| ----------- | ----------- | -------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full resource name of the Workload Identity Provider | Yes |
| `GCP_SERVICE_ACCOUNT` | Service account email to impersonate | Yes |
| `GCP_PROJECT_NUMBER` | GCP project number (12-digit number) | Optional |

### GCP_WORKLOAD_IDENTITY_PROVIDER

The full resource name of the Workload Identity Provider.

**Expected format:**

```text
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER
```

**Example:**

```text
projects/123456789012/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

- `PROJECT_NUMBER` — Your GCP project number (12-digit numeric value, not the project ID)
- `POOL` — The name of your Workload Identity Pool (e.g., `github-pool`)
- `PROVIDER` — The name of your Workload Identity Provider (e.g., `github-provider`)

### GCP_SERVICE_ACCOUNT

The email address of the GCP service account that the workflow will impersonate.

**Expected format:**

```text
SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com
```

**Example:**

```text
github-actions-deployer@my-project.iam.gserviceaccount.com
```

## Input Validation

The workflow includes a pre-authentication validation step that checks:

1. **GCP_WORKLOAD_IDENTITY_PROVIDER** is not empty  
2. **GCP_WORKLOAD_IDENTITY_PROVIDER** matches the expected resource-name format  
3. **GCP_SERVICE_ACCOUNT** is not empty  
4. **GCP_SERVICE_ACCOUNT** matches the expected service account email format

If any validation fails, the workflow will exit early with a clear error message, preventing confusing `invalid_target` errors from the Google auth action.

## Step-by-Step: Configure Workload Identity Federation in GCP

Follow these steps to set up Workload Identity Federation for GitHub Actions.

### 1. Get Your Project Number

```bash
gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)'
```

### 2. Create a Workload Identity Pool

```bash
gcloud iam workload-identity-pools create github-pool \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project=YOUR_PROJECT_ID
```

### 3. Create a Workload Identity Provider

```bash
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project=YOUR_PROJECT_ID
```

### 4. Create a Service Account (or use an existing one)

```bash
gcloud iam service-accounts create github-actions-deployer \
  --display-name="GitHub Actions Deployer" \
  --project=YOUR_PROJECT_ID
```

### 5. Grant Required Roles to the Service Account

Grant the service account the permissions it needs (adjust based on your workflow requirements):

```bash
# Cloud Build permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

# Artifact Registry permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Cloud Run permissions (if deploying)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Service Account User (for actAs permission)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### 6. Allow GitHub to Impersonate the Service Account

Bind the Workload Identity Pool to the service account. Replace `YOUR_GITHUB_ORG` and `YOUR_REPO` with your actual values:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_GITHUB_ORG/YOUR_REPO" \
  --project=YOUR_PROJECT_ID
```

**Alternative: Allow all repos in an organization:**

```bash
gcloud iam service-accounts add-iam-policy-binding \
  github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository_owner/YOUR_GITHUB_ORG" \
  --project=YOUR_PROJECT_ID
```

### 7. Get the Full Provider Resource Name

```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --format='value(name)' \
  --project=YOUR_PROJECT_ID
```

This will output something like:

```text
projects/123456789012/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

### 8. Configure GitHub Repository Secrets

1. Go to your repository on GitHub  
2. Navigate to Settings → Secrets and variables → Actions  
3. Add the following secrets:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`: The full provider resource name from step 7  
   - `GCP_SERVICE_ACCOUNT`: `github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com`

## Troubleshooting

### Error: "Missing repository secret: GCP_WORKLOAD_IDENTITY_PROVIDER"

The secret is not configured. Add it in **Settings → Secrets and variables → Actions → New repository secret**.

### Error: "GCP_WORKLOAD_IDENTITY_PROVIDER has invalid format"

The secret value doesn't match the expected pattern. Verify:

- It starts with `projects/`  
- The project number is numeric (12 digits, not the project ID string)  
- It contains `/locations/global/workloadIdentityPools/`  
- Pool and provider IDs are present

### Error: "GCP_SERVICE_ACCOUNT may have invalid format"

The secret value doesn't match the expected service account email pattern. Verify:

- It ends with `.iam.gserviceaccount.com`  
- The service account name (before `@`) is valid  
- The project ID (after `@`) is correct

### Error: "invalid_target" from google-github-actions/auth

This error typically occurs when:

- The `GCP_WORKLOAD_IDENTITY_PROVIDER` secret is missing or malformed  
- The provider resource name format is incorrect  
- The Workload Identity Pool or Provider doesn't exist

**Solution:** Verify the secret value matches the exact format:
`projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER`

### Error: "Permission denied" or "Unable to impersonate service account"

This error occurs when:

- The service account binding is not configured correctly  
- The repository is not in the allowed list

**Solution:** Verify the workload identity user binding (step 6) includes your repository.

### Error: "Permission denied" after successful authentication

The service account may not have the required IAM roles. Verify the roles in Step 5 are granted.

## Workflow Configuration

The build-and-deploy workflow:

- Triggers on push to `main`: Builds and pushes container image  
- Triggers on pull_request to `main`: Validates build configuration only (no GCP auth needed)  
- Manual deployment: Use `workflow_dispatch` with `deploy=true` to deploy to Cloud Run

The workflow validates GCP authentication inputs before attempting to authenticate, providing clear error messages if secrets are missing or malformed.

## References

- [google-github-actions/auth](https://github.com/google-github-actions/auth) — GitHub Action for GCP authentication  
- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation) — GCP documentation  
- [Configuring Workload Identity Federation for GitHub Actions](https://cloud.google.com/blog/products/identity-security/enabling-keyless-authentication-from-github-actions)
