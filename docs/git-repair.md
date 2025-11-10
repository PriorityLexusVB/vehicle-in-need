<!-- markdownlint-disable MD013 -->
<!-- Long lines intentional for command examples -->

# Git Repair Instructions

This document provides instructions for consolidating Git history and pushing changes to the main branch.

## Context

The repository may have divergent Git history that needs to be consolidated. This process will:

1. Create a backup of the current state
2. Align the main branch with origin/main
3. Squash-merge all recent changes into a single commit
4. Push the consolidated changes to main

## Prerequisites

- Git access with push permissions to the main branch
- Local clone of the repository
- Current working directory should be clean (no uncommitted changes)

## Process

### 1. Abort Any Partial Operations

```bash
cd /path/to/vehicle-in-need
git rebase --abort || true
git merge --abort || true
```

### 2. Create Backup Branch

```bash
TS=$(date -u +%Y%m%d-%H%M%S)
git switch -c backup-$TS
```

This creates a backup branch with a timestamp (e.g., `backup-20251108-235854`).

### 3. Align Main with Remote

```bash
git fetch origin --tags
git switch main
git reset --hard origin/main
```

### 4. Squash Merge Changes

```bash
git merge --squash backup-$TS
```

Replace `$TS` with your actual backup branch timestamp.

### 5. Commit Consolidated Changes

```bash
git commit -m "feat: consolidate recent changes (tests/CI/Vertex test guard/docs)

- Add Buffer polyfill verification test for Node.js compatibility
- Add DISABLE_VERTEX_AI guard to aiProxy.cjs to skip Vertex AI init in tests
- Set DISABLE_VERTEX_AI in vitest.config.ts and CI workflow
- Create comprehensive MCP reset documentation (docs/mcp-reset.md)
- Update README to reference MCP reset guide
- Enhance CI workflow with explicit DISABLE_VERTEX_AI flag

These changes improve test reliability by preventing metadata.google.internal
calls during unit tests, add polyfill verification, and provide clear
documentation for resolving MCP authentication issues."
```

### 6. Push to Main

```bash
git push --force-with-lease origin main
```

**Note:** `--force-with-lease` is safer than `--force` as it will fail if the remote has changes you don't have locally.

### 7. Configure Rebase for Future Pulls

```bash
git config --global pull.rebase true
```

This ensures future pulls use rebase for a linear history.

## Verification

After completing the process, verify:

```bash
# Check status is clean
git status

# Verify no diff with remote
git diff origin/main

# Check recent commits
git log --oneline -5
```

Expected result:

- Clean working tree
- No difference with origin/main
- One consolidated commit on top of previous main

## Troubleshooting

### Git Lock Error

If you get "cannot lock ref" errors:

```bash
git rebase --abort || true
git gc --prune=now
git fetch origin --tags
git switch main
git reset --hard origin/main
git merge --squash backup-$TS
git commit -m "feat: consolidate recent changes (retry)"
git push --force-with-lease origin main
```

### Authentication Failed

Ensure you have:

- Valid Git credentials configured
- Push access to the repository
- GitHub token or SSH key properly set up

### Remote Has New Changes

If `--force-with-lease` fails because the remote has changes:

```bash
git fetch origin main
# Review the new changes
git log origin/main
# If safe to proceed, use --force (with caution)
git push --force origin main
```

## Notes

- This is a one-time operation to consolidate history
- The backup branch is preserved for safety
- All changes from the PR branch are included in the consolidated commit
- This process maintains the content of all changes while simplifying the history
