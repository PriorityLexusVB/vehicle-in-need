# IAM Documentation Index

This index helps you navigate the IAM-related documentation for the Cloud Run deployment.

---

## 🚨 Having an IAM Error?

If you're seeing this error:

```
ERROR: Permission 'iam.serviceaccounts.actAs' denied
```

**Start here**: [QUICK_IAM_FIX.md](./QUICK_IAM_FIX.md) (5-minute fix)

---

## 📚 Documentation by Purpose

### For Quick Fix (5-10 minutes)

**[QUICK_IAM_FIX.md](./QUICK_IAM_FIX.md)**

- Copy-paste commands to fix the IAM error
- TL;DR version with essential steps only
- Verification commands included
- **Use this if**: You want to fix it fast and move on

### For Step-by-Step Execution (15-20 minutes)

**[IAM_FIX_EXECUTION_GUIDE.md](./IAM_FIX_EXECUTION_GUIDE.md)**

- Comprehensive 7-step walkthrough
- Detailed explanations for each command
- Troubleshooting section included
- **Use this if**: You want to understand what you're doing

### For Tracking Your Progress

**[IAM_FIX_CHECKLIST.md](./IAM_FIX_CHECKLIST.md)**

- Printable checklist format
- Pre-execution, execution, and post-execution sections
- Checkbox format for tracking
- Space for notes and documentation
- **Use this if**: You want to track and document your work

### For Stakeholder Communication

**[IAM_FIX_SUMMARY.md](./IAM_FIX_SUMMARY.md)**

- Executive summary suitable for PR/issue comments
- Problem statement and root cause analysis
- Solution overview and deliverables
- Security considerations
- **Use this if**: You need to explain the fix to others

### For Understanding the Architecture

**[IAM_CONFIGURATION_SUMMARY.md](./IAM_CONFIGURATION_SUMMARY.md)**

- Complete IAM architecture documentation
- All service accounts and their roles
- Security best practices
- Long-term reference
- **Use this if**: You want to understand the full IAM design

---

## 🛠️ Tools & Scripts

### Automated IAM Setup

**[scripts/setup-iam-permissions.sh](./scripts/setup-iam-permissions.sh)**

```bash
# Dry-run mode (shows what will be done)
./scripts/setup-iam-permissions.sh

# Execute mode (actually applies changes)
./scripts/setup-iam-permissions.sh --execute

# Help
./scripts/setup-iam-permissions.sh --help
```

**Features**:

- Verifies service accounts exist
- Auto-creates runtime SA if missing
- Grants all required permissions
- Shows de-privilege commands for default compute SA
- Safe dry-run mode by default

---

## 📖 Complete Documentation Set

### IAM-Specific (Fix the Error)

1. **[QUICK_IAM_FIX.md](./QUICK_IAM_FIX.md)** - 5-minute quick fix
2. **[IAM_FIX_EXECUTION_GUIDE.md](./IAM_FIX_EXECUTION_GUIDE.md)** - Detailed walkthrough
3. **[IAM_FIX_CHECKLIST.md](./IAM_FIX_CHECKLIST.md)** - Execution checklist
4. **[IAM_FIX_SUMMARY.md](./IAM_FIX_SUMMARY.md)** - Executive summary

### IAM Architecture (Understanding)

5. **[IAM_CONFIGURATION_SUMMARY.md](./IAM_CONFIGURATION_SUMMARY.md)** - Full IAM design
6. **[IAM_VALIDATION_CHECKLIST.md](./IAM_VALIDATION_CHECKLIST.md)** - Validation procedures
7. **[scripts/setup-iam-permissions.sh](./scripts/setup-iam-permissions.sh)** - Automated setup

### Deployment Procedures

8. **[CLOUD_RUN_DEPLOYMENT_RUNBOOK.md](./CLOUD_RUN_DEPLOYMENT_RUNBOOK.md)** - Complete deployment guide
9. **[CONTAINER_DEPLOYMENT_GUIDE.md](./CONTAINER_DEPLOYMENT_GUIDE.md)** - Container deployment
10. **[cloudbuild.yaml](./cloudbuild.yaml)** - Cloud Build configuration

### Troubleshooting & Reference

11. **[CONTAINER_IMAGE_ISSUES.md](./CONTAINER_IMAGE_ISSUES.md)** - Image troubleshooting
12. **[DOCKER_BUILD_NOTES.md](./DOCKER_BUILD_NOTES.md)** - Docker build notes
13. **[README.md](./README.md#cloud-run-deployment)** - Main README deployment section

---

## 🎯 Common Scenarios

### Scenario 1: First-Time Setup

**You've never deployed this before and need to set up IAM permissions:**

1. Read [IAM_FIX_SUMMARY.md](./IAM_FIX_SUMMARY.md) to understand what will be done
2. Follow [IAM_FIX_EXECUTION_GUIDE.md](./IAM_FIX_EXECUTION_GUIDE.md) step-by-step
3. Use [IAM_FIX_CHECKLIST.md](./IAM_FIX_CHECKLIST.md) to track progress

**Alternative**: Run `./scripts/setup-iam-permissions.sh --execute`

### Scenario 2: Deployment Just Broke

**Deployment was working, now getting `actAs` error:**

1. Open [QUICK_IAM_FIX.md](./QUICK_IAM_FIX.md)
2. Run the commands in Step 2 and Step 3 (the critical ones)
3. Wait 1-2 minutes for IAM propagation
4. Retry deployment

### Scenario 3: Understanding the System

**You want to understand the IAM architecture before making changes:**

1. Read [IAM_FIX_SUMMARY.md](./IAM_FIX_SUMMARY.md) for overview
2. Read [IAM_CONFIGURATION_SUMMARY.md](./IAM_CONFIGURATION_SUMMARY.md) for details
3. Review [cloudbuild.yaml](./cloudbuild.yaml) lines 12-21 and 82
4. Then follow execution guide when ready

### Scenario 4: Documenting for Team

**You need to explain the IAM setup to your team:**

1. Share [IAM_FIX_SUMMARY.md](./IAM_FIX_SUMMARY.md) for overview
2. Link to [QUICK_IAM_FIX.md](./QUICK_IAM_FIX.md) for execution
3. Reference [IAM_CONFIGURATION_SUMMARY.md](./IAM_CONFIGURATION_SUMMARY.md) for details
4. Provide [IAM_FIX_CHECKLIST.md](./IAM_FIX_CHECKLIST.md) for tracking

---

## 🔍 Quick Reference

### The One Critical Command

This command fixes the `actAs` error:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project="gen-lang-client-0615287333"
```

### Required Service Accounts

- **Cloud Build SA**: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
- **Runtime SA**: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`

### Verification Command

After applying IAM changes:

```bash
gcloud iam service-accounts get-iam-policy \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --project="gen-lang-client-0615287333"
```

Expected: Should show Cloud Build SA with `roles/iam.serviceAccountUser`

---

## ❓ Still Need Help?

1. **Check troubleshooting** in [IAM_FIX_EXECUTION_GUIDE.md](./IAM_FIX_EXECUTION_GUIDE.md#troubleshooting)
2. **Review Cloud Build logs**: <https://console.cloud.google.com/cloud-build/builds>
3. **Check service account exists**:

   ```bash
   gcloud iam service-accounts list --project=gen-lang-client-0615287333
   ```

4. **Verify current permissions**:

   ```bash
   gcloud projects get-iam-policy gen-lang-client-0615287333 \
     --flatten="bindings[].members" \
     --filter="bindings.members:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com"
   ```

---

## 📝 Document Navigation Tips

- **Just want to fix it?** → [QUICK_IAM_FIX.md](./QUICK_IAM_FIX.md)
- **Want to understand it?** → [IAM_FIX_EXECUTION_GUIDE.md](./IAM_FIX_EXECUTION_GUIDE.md)
- **Need to track progress?** → [IAM_FIX_CHECKLIST.md](./IAM_FIX_CHECKLIST.md)
- **Explaining to others?** → [IAM_FIX_SUMMARY.md](./IAM_FIX_SUMMARY.md)
- **Studying the architecture?** → [IAM_CONFIGURATION_SUMMARY.md](./IAM_CONFIGURATION_SUMMARY.md)

---

**Last Updated**: 2025-11-16  
**Related Issue**: Cloud Run IAM permissions and deployment fix
