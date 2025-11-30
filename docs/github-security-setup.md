# GitHub Security Setup

This document describes the security automation configured for this repository and the
manual steps required to complete the setup.

## A. Configured via Repository Files (This PR)

### 1. Dependabot Configuration (`.github/dependabot.yml`)

Dependabot has been configured to automatically create pull requests for dependency updates:

| Ecosystem | Directory | Schedule | Description |
| --------- | --------- | -------- | ----------- |
| `npm` | `/` | Weekly (Monday 5:00 AM ET) | Root project dependencies (React, Firebase, Vite, etc.) |
| `npm` | `/functions` | Weekly (Monday 5:00 AM ET) | Firebase Cloud Functions dependencies |
| `github-actions` | `/` | Monthly | GitHub Actions workflow updates |

**Features:**

- **Grouped updates** to reduce PR noise:
  - Security updates are grouped together for quick review
  - Production and development dependencies are grouped separately
  - Minor and patch updates are batched together
- **Commit message prefixes** for clear changelog entries (`chore(deps)`, `chore(ci)`)
- **Labels** automatically applied for easy filtering

### 2. CodeQL Workflow (`.github/workflows/codeql.yml`)

CodeQL static analysis has been configured for automated security scanning:

- **Languages analyzed:** JavaScript/TypeScript
- **Triggers:**
  - On push to `main` branch
  - On pull requests to `main` branch
  - Weekly scheduled scan (Monday 5:00 AM UTC)
- **Query suite:** `security-extended` for comprehensive coverage

## B. Must Be Enabled Manually in GitHub Settings

Navigate to your repository's **Settings → Code security and analysis** and enable
the following features:

### Required Settings

1. **Dependency graph** ✅
   - Enables visibility into your project's dependencies
   - Required for Dependabot to function

2. **Dependabot alerts** ✅
   - Receive alerts about vulnerable dependencies
   - Automatically notifies maintainers of security issues

3. **Dependabot security updates** ✅
   - Automatically creates PRs to fix vulnerable dependencies
   - Works in conjunction with the dependabot.yml configuration

4. **Dependabot version updates** ✅
   - Enables the version update PRs defined in dependabot.yml
   - Creates PRs for outdated (but not necessarily vulnerable) dependencies

### Recommended Settings

5. **Code scanning** ✅
   - Enable "Default" configuration OR use the CodeQL workflow added in this PR
   - If using the workflow from this PR, select "Advanced" and GitHub will
     detect the existing workflow

6. **Secret scanning** ✅
   - Detects accidentally committed secrets (API keys, tokens, etc.)
   - Alerts maintainers when secrets are found in the repository history

7. **Push protection** ✅
   - Prevents commits containing secrets from being pushed
   - Proactively blocks secret exposure before it reaches the repository

### Note on GitHub Advanced Security

Some features may require **GitHub Advanced Security** to be enabled for the
organization:

- Code scanning with CodeQL
- Secret scanning and push protection (for private repositories)

For public repositories, these features are available for free.

## C. Verification Checklist

After enabling the settings above, verify the setup is working:

- [ ] Navigate to **Security → Dependabot** and confirm alerts are enabled
- [ ] Check **Actions** tab for CodeQL workflow runs
- [ ] Navigate to **Security → Code scanning** and confirm CodeQL is running
- [ ] Test secret scanning by creating a branch with a test secret (if safe to do so)

## D. Maintenance

- Review and merge Dependabot PRs regularly
- Monitor CodeQL alerts in the Security tab
- Keep the CodeQL workflow up to date (Dependabot will help with this)
