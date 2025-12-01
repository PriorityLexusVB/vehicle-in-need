# Documentation Index

This directory contains operational documentation for the Pre-Order & Dealer Exchange Tracker application.

## Quick Start

- **New to the project?** Start with [`../README.md`](../README.md)
- **Deploying?** See [`../DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md)

## Operational Runbooks

These are current, maintained operational guides:

### Cloud Build & Deployment

- [`operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md`](operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md) - Cloud Build trigger configuration and troubleshooting
- [`operations/CLOUD_RUN_DEPLOYMENT_RUNBOOK.md`](operations/CLOUD_RUN_DEPLOYMENT_RUNBOOK.md) - Cloud Run deployment procedures
- [`operations/DEPLOYMENT_CHECKLIST.md`](operations/DEPLOYMENT_CHECKLIST.md) - Pre-deployment verification checklist
- [`operations/GCP_MANUAL_CONFIGURATION_CHECKLIST.md`](operations/GCP_MANUAL_CONFIGURATION_CHECKLIST.md) - GCP project setup and configuration

### Build System

- [`operations/TAILWIND_CSS_SAFEGUARDS.md`](operations/TAILWIND_CSS_SAFEGUARDS.md) - Tailwind CSS build safeguards and verification

## Development Documentation

- [`CI_AND_MCP_DOCUMENTATION.md`](CI_AND_MCP_DOCUMENTATION.md) - CI/CD and Model Context Protocol setup
- [`VERSION_TRACKING.md`](VERSION_TRACKING.md) - Deployment traceability and version management system
- [`GITHUB_ISSUE_TEMPLATE.md`](GITHUB_ISSUE_TEMPLATE.md) - Template for creating GitHub issues

## PR Reviews

- [`PR_REVIEW_143_156.md`](PR_REVIEW_143_156.md) - Analysis and merge instructions for PRs #143-156

## Archived Documentation

The [`archive/`](archive/) directory contains historical documentation from previous fixes and investigations. These are kept for reference but are not actively maintained:

- Cloud Build fixes and investigations
- CSS deployment investigations
- IAM configuration iterations
- Firestore rules fixes
- Various PR summaries and completion reports

**Note**: If you're looking for current deployment or troubleshooting information, use the operational runbooks above, not the archived docs.

## Repository Structure

```
vehicle-in-need/
├── README.md                    # Main project documentation
├── DEPLOYMENT_GUIDE.md          # Deployment procedures (primary reference)
├── docs/
│   ├── INDEX.md                 # This file
│   ├── operations/              # Current operational runbooks
│   │   ├── CLOUD_BUILD_TRIGGER_RUNBOOK.md
│   │   ├── CLOUD_RUN_DEPLOYMENT_RUNBOOK.md
│   │   ├── DEPLOYMENT_CHECKLIST.md
│   │   ├── GCP_MANUAL_CONFIGURATION_CHECKLIST.md
│   │   └── TAILWIND_CSS_SAFEGUARDS.md
│   ├── archive/                 # Historical documentation (not actively maintained)
│   ├── CI_AND_MCP_DOCUMENTATION.md
│   └── GITHUB_ISSUE_TEMPLATE.md
├── scripts/                     # Build and deployment scripts
│   ├── verify-css-in-build.sh
│   ├── pre-deploy-css-check.sh
│   └── ...
└── cloudbuild.yaml              # Cloud Build configuration
```

## Contributing Documentation

When adding new documentation:

1. **Operational guides** go in `docs/operations/`
2. **Development guides** go in `docs/`
3. **Deployment procedures** should update `DEPLOYMENT_GUIDE.md`
4. **Archived materials** go in `docs/archive/`

Keep documentation:

- **Current** - Remove or archive outdated information
- **Focused** - One topic per document
- **Actionable** - Include clear steps and examples
- **Maintained** - Update when processes change

## Document Lifecycle

1. **Active** - Current operational documentation (in `operations/`)
2. **Superseded** - Move to `archive/` when replaced by newer docs
3. **Historical** - Keep in `archive/` for reference only

The `archive/` directory is not a dumping ground—it contains completed investigations and fixes that led to the current system state. If something in the archive is still relevant, it should be incorporated into active documentation.
