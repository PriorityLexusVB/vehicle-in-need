# Stabilization Checklist - Quick Reference

## Overview

The `STABILIZATION_CHECKLIST.md` document provides a comprehensive, reusable template for performing full stabilization passes on the `vehicle-in-need` repository.

## When to Use

Use the stabilization checklist when:

- 🔴 **CI/CD pipelines are failing**
- 🔴 **Firestore security rules tests are failing**
- 🔴 **Cloud Build deployments are failing**
- 🟡 **After major refactoring or dependency updates**
- 🟡 **When restoring repository to a "guaranteed green state"**
- 🟢 **During quarterly stability audits**
- 🟢 **When onboarding new developers to understand the project**

## Quick Start

1. **Open STABILIZATION_CHECKLIST.md**
2. **Start with Pre-Stabilization Assessment**
3. **Work through phases sequentially:**
   - Phase 1: Build and Lint
   - Phase 2: Firestore Rules
   - Phase 3: Cloud Build
   - Phase 4: CI/CD Pipeline
   - Phase 5: Custom Claims (optional)
   - Phase 6: Documentation
   - Phase 7: Deployment
   - Phase 8: Regression Analysis (if needed)

## Current Repository Status (2025-11-18)

### ✅ All Systems Green

| Component | Status | Tests |
|-----------|--------|-------|
| **Linting** | ✅ PASSING | eslint + markdownlint |
| **Build** | ✅ PASSING | Vite build + CSS verification |
| **Firestore Rules** | ✅ PASSING | 42/42 (100%) |
| **Unit Tests** | ✅ PASSING | All passing |
| **CI Workflows** | ✅ PASSING | GitHub Actions |
| **Security** | ✅ CLEAN | CodeQL scan |

### Recent Stabilization Work

The checklist was created based on successful stabilization efforts in:

- **PR #99** (Nov 18): Removed unused SERVICE_URL substitution, aligned Cloud Build docs
- **PR #95** (Nov 18): Fixed CI workflows and added MCP documentation  
- **PR #92** (Nov 18): Added operator tooling and deployment guides
- **PR #91** (Nov 18): Fixed Firestore rules evaluation errors
- **PR #89** (Nov 17): Initial stabilization of Cloud Build and Firestore rules

## Key Learnings Incorporated

### 1. Firestore Rules Best Practices

✅ **Always check for null/undefined:**
```javascript
// BAD
resource.data.field

// GOOD
resource != null && ('field' in resource.data) && resource.data.field
```

✅ **Prefer custom claims over get() calls:**
```javascript
// SLOW + CIRCULAR DEPENDENCIES
get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isManager

// FAST + RELIABLE
request.auth.token.isManager == true
```

### 2. Cloud Build Substitutions

✅ **Custom substitutions must start with underscore:**
```yaml
substitutions:
  _REGION: us-west1           # ✅ CORRECT
  _SERVICE: my-service        # ✅ CORRECT
  SERVICE_URL: https://...    # ❌ INVALID (no underscore)
```

### 3. CI/CD Pipeline Reliability

✅ **Full git history for diff operations:**
```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0  # Required for merge-base calculations
```

✅ **Use commit SHAs, not branch refs:**
```bash
# Good
git diff ${{ github.event.pull_request.base.sha }} ${{ github.event.pull_request.head.sha }}

# Problematic
git diff origin/main...HEAD  # Can fail with shallow checkout
```

## Common Issues Covered

The checklist includes solutions for:

| Issue | Section | Quick Fix |
|-------|---------|-----------|
| "Property is undefined" | Phase 2 | Add null checks to rules |
| Invalid substitution | Phase 3 | Add `_` prefix to custom vars |
| Test flakiness | Phase 2 | Use custom claims, avoid get() |
| CSS not loading | Phase 3 | Check postbuild script |
| Emulator hangs | Troubleshooting | Clear emulator data |
| Merge conflicts | Phase 8 | Use regression analysis |

## Document Structure

### Phase-by-Phase Breakdown

Each phase includes:
- ☑️ **Checklist items** - Specific tasks to complete
- 💻 **Code examples** - Copy-paste ready commands
- 🔍 **What to check** - Specific validation steps
- ⚠️ **Common issues** - Known problems and solutions
- ✅ **Success criteria** - How to know you're done

### Support Sections

- **Troubleshooting Guide** - Solutions to specific error messages
- **Reference Links** - Internal docs and external resources
- **Revision History** - Document version tracking

## Success Criteria

Repository is considered stable when:

1. ✅ All linters pass (code + markdown)
2. ✅ Build completes successfully with CSS
3. ✅ 100% Firestore rules tests pass
4. ✅ All CI workflows pass
5. ✅ Cloud Build configuration valid
6. ✅ Deployment succeeds
7. ✅ Application functions correctly
8. ✅ No security vulnerabilities
9. ✅ Documentation up to date

## Maintenance

### Updating the Checklist

After each stabilization effort:

1. Document new issues encountered
2. Add solutions to troubleshooting section
3. Update best practices if patterns change
4. Increment revision history
5. Commit updates to main branch

### Using as a Template

The checklist can be adapted for other projects by:

1. Adjusting collection names in Firestore rules section
2. Updating Cloud Build substitutions for your project
3. Modifying deployment commands for your GCP project
4. Adding project-specific quality gates

## Related Documentation

- **STABILIZATION_COMPLETE.md** - Last stabilization report (Nov 17, 2025)
- **CLOUD_BUILD_CONFIGURATION.md** - Deployment configuration reference
- **FIRESTORE_RULES_CUSTOM_CLAIMS.md** - Custom claims implementation guide
- **OPERATOR_DEPLOYMENT_GUIDE.md** - Production deployment procedures

## Questions or Issues?

If you encounter issues not covered in the checklist:

1. Check the troubleshooting section
2. Review related documentation listed above
3. Check recent PRs for similar issues
4. Create an issue with the "stabilization" label
5. Update the checklist with your solution

---

**Version:** 1.0  
**Last Updated:** 2025-11-18  
**Created By:** Copilot Agent  
**Based On:** Stabilization work in PRs #89, #91, #92, #95, #99
