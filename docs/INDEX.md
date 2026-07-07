# Documentation Index

This directory contains operational and development documentation for the
Pre-Order & Dealer Exchange Tracker application.

## Quick Start

- **New to the project?** Start with [`../README.md`](../README.md)
- **Deploying?** See [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md) and [`operations/CLOUD_RUN_DEPLOYMENT_RUNBOOK.md`](operations/CLOUD_RUN_DEPLOYMENT_RUNBOOK.md)

## Operational Runbooks

These are current, maintained operational guides.

### Cloud Build & Deployment

- [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md) - Cloud Run container deployment overview
- [`operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md`](operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md) - Cloud Build trigger configuration and troubleshooting
- [`operations/CLOUD_RUN_DEPLOYMENT_RUNBOOK.md`](operations/CLOUD_RUN_DEPLOYMENT_RUNBOOK.md) - Cloud Run deployment procedures
- [`operations/DEPLOYMENT_CHECKLIST.md`](operations/DEPLOYMENT_CHECKLIST.md) - Pre-deployment verification checklist
- [`operations/GCP_MANUAL_CONFIGURATION_CHECKLIST.md`](operations/GCP_MANUAL_CONFIGURATION_CHECKLIST.md) - GCP project setup and configuration

### Build System

- [`operations/TAILWIND_CSS_SAFEGUARDS.md`](operations/TAILWIND_CSS_SAFEGUARDS.md) - Tailwind CSS build safeguards and verification

## Development Documentation

- [`CI.md`](CI.md) - GCP Workload Identity Federation setup for CI/CD workflows
- [`CI_AND_MCP_DOCUMENTATION.md`](CI_AND_MCP_DOCUMENTATION.md) - CI/CD and Model Context Protocol setup
- [`VERSION_TRACKING.md`](VERSION_TRACKING.md) - Deployment traceability and version management system
- [`GITHUB_ISSUE_TEMPLATE.md`](GITHUB_ISSUE_TEMPLATE.md) - Template for creating GitHub issues
- [`DATA_MODEL_SUMMARY.md`](DATA_MODEL_SUMMARY.md) - Firestore data model for orders/deals

## PR Reviews

- [`PR_REVIEW_143_156.md`](PR_REVIEW_143_156.md) - Analysis and merge instructions for PRs #143-156

## Archived Documentation

The [`archive/`](archive/) directory contains historical documentation from
previous fixes and investigations. These are kept for reference but are not
actively maintained.

Archived materials include:

- Cloud Build fixes and investigations
- CSS deployment investigations
- IAM configuration iterations
- Firestore rules fixes
- Archived root-level branch/deployment/implementation reports from 2024-2025
- Various PR summaries and completion reports

Current deployment or troubleshooting information belongs in the maintained
operational runbooks above, not archived docs.

## Repository Structure

```text
vehicle-in-need/
|-- README.md                    # Main project documentation
|-- STATE.md                     # Current project truth
|-- docs/
|   |-- INDEX.md                 # This file
|   |-- DEPLOYMENT_RUNBOOK.md    # Current deployment overview
|   |-- operations/              # Current operational runbooks
|   |-- archive/                 # Historical documentation
|   |   `-- root-legacy-2026-07-07/
|   |-- CI_AND_MCP_DOCUMENTATION.md
|   `-- GITHUB_ISSUE_TEMPLATE.md
|-- scripts/                     # Build and deployment scripts
`-- cloudbuild.yaml              # Cloud Build configuration
```

## Contributing Documentation

When adding new documentation:

1. **Operational guides** go in `docs/operations/`
2. **Development guides** go in `docs/`
3. **Deployment procedures** should update `docs/DEPLOYMENT_RUNBOOK.md` or the relevant `docs/operations/` runbook
4. **Archived materials** go in `docs/archive/`

Keep documentation:

- **Current** - Remove or archive outdated information
- **Focused** - One topic per document
- **Actionable** - Include clear steps and examples
- **Maintained** - Update when processes change

## Document Lifecycle

1. **Active** - Current operational documentation
2. **Superseded** - Move to `archive/` when replaced by newer docs
3. **Historical** - Keep in `archive/` for reference only
