# GCP Authentication for CI/CD Workflows

This document describes the GCP (Google Cloud Platform) secrets required for the GitHub Actions CI/CD workflows, specifically for the Build-and-Push Container workflow (`.github/workflows/build-and-deploy.yml`).

## Required Repository Secrets

The following secrets must be configured in your GitHub repository settings (**Settings > Secrets and variables > Actions**):

### GCP_WORKLOAD_IDENTITY_PROVIDER

The full resource name of the Workload Identity Provider.

**Expected format:**

```text
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID
```

**Example:**

```text
projects/123456789012/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

- `PROJECT_NUMBER`: Your GCP project number (numeric, not the project ID)
- `POOL_ID`: The Workload Identity Pool ID (e.g., `github-pool`)
- `PROVIDER_ID`: The Workload Identity Provider ID (e.g., `github-provider`)

### GCP_SERVICE_ACCOUNT

The email address of the GCP service account to impersonate.

**Expected format:**

```text
SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com
```

**Example:**

```text
github-actions-deployer@my-project-id.iam.gserviceaccount.com
```

## Setting Up Workload Identity Federation

Workload Identity Federation allows GitHub Actions to authenticate to GCP without storing long-lived service account keys.

### Step 1: Create a Workload Identity Pool

```bash
gcloud iam workload-identity-pools create "github-pool" \
  --project="PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

### Step 2: Create a Workload Identity Provider

```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

### Step 3: Create a Service Account

```bash
gcloud iam service-accounts create "github-actions-deployer" \
  --project="PROJECT_ID" \
  --display-name="GitHub Actions Deployer"
```

### Step 4: Grant Required Roles to the Service Account

Grant the necessary roles for Cloud Build and Artifact Registry:

```bash
# Cloud Build Editor
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

# Artifact Registry Writer
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Cloud Run Admin (if deploying to Cloud Run)
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Service Account User (required for Cloud Run deployments)
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### Step 5: Allow GitHub Actions to Impersonate the Service Account

Replace `OWNER` and `REPO` with your GitHub organization/user and repository name:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-deployer@PROJECT_ID.iam.gserviceaccount.com" \
  --project="PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/OWNER/REPO"
```

### Step 6: Get the Workload Identity Provider Resource Name

```bash
gcloud iam workload-identity-pools providers describe "github-provider" \
  --project="PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --format="value(name)"
```

This outputs the full resource name to use for `GCP_WORKLOAD_IDENTITY_PROVIDER`.

## Validation

The workflow includes a pre-auth validation step that checks:

1. **GCP_WORKLOAD_IDENTITY_PROVIDER** is not empty
2. **GCP_WORKLOAD_IDENTITY_PROVIDER** matches the expected resource-name format
3. **GCP_SERVICE_ACCOUNT** is not empty
4. **GCP_SERVICE_ACCOUNT** matches the expected service account email format

If any validation fails, the workflow will exit early with a clear error message, preventing confusing `invalid_target` errors from the Google auth action.

## Troubleshooting

### Error: "Missing repository secret: GCP_WORKLOAD_IDENTITY_PROVIDER"

The secret is not configured. Add it in **Settings > Secrets and variables > Actions > New repository secret**.

### Error: "GCP_WORKLOAD_IDENTITY_PROVIDER has invalid format"

The secret value doesn't match the expected pattern. Verify:

- It starts with `projects/`
- The project number is numeric (not the project ID string)
- It contains `/locations/global/workloadIdentityPools/`
- Pool and provider IDs are present

### Error: "GCP_SERVICE_ACCOUNT has invalid format"

The secret value doesn't match the expected service account email pattern. Verify:

- It ends with `.iam.gserviceaccount.com`
- The service account name (before `@`) contains only alphanumeric characters, dots, underscores, or hyphens
- The project ID (after `@`) is valid

### Error: "invalid_target" from google-github-actions/auth

This typically means the Workload Identity Provider resource name is malformed or the provider doesn't exist. Double-check:

1. The project number is correct
2. The pool and provider were created successfully
3. The provider is configured for GitHub OIDC tokens

### Error: "Permission denied" after successful authentication

The service account may not have the required IAM roles. Verify the roles in Step 4 are granted.

## References

- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Configuring Workload Identity Federation for GitHub Actions](https://cloud.google.com/iam/docs/workload-identity-federation-with-other-providers#github-actions)
- [google-github-actions/auth](https://github.com/google-github-actions/auth)
