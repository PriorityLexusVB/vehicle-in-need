<!-- markdownlint-disable MD009 MD013 MD031 MD032 MD040 -->
<!-- Long lines and formatting intentional for command examples and comprehensive documentation -->

# Branch Hygiene and Git Workflow Policy

This document outlines the recommended Git workflow and branch hygiene practices for the vehicle-in-need repository.

## Branch Strategy

### Main Branch: `main`

- **Purpose:** Production-ready code only
- **Protection:** Should be protected (require PR reviews)
- **Deployment:** Auto-deploys to production on merge
- **Direct Commits:** ❌ Never commit directly to `main`

### Feature Branches

**Naming Convention:**
```
feat/<feature-name>          # New features
fix/<bug-name>               # Bug fixes
docs/<doc-update>            # Documentation updates
test/<test-addition>         # Test additions/improvements
chore/<maintenance-task>     # Maintenance, refactoring, cleanup
refactor/<refactor-name>     # Code refactoring
```

**Examples:**
- `feat/admin-hardening-docs`
- `fix/login-redirect-loop`
- `docs/emulator-setup-guide`
- `test/orderlist-copy-alignment`
- `chore/dependency-updates`

### Copilot Agent Branches

When using GitHub Copilot agents for automated code changes:

```
copilot/<description>         # Automated agent work
copilot/sub-pr-<number>       # Sub-tasks from main PR
```

**Examples:**
- `copilot/feat-repo-hygiene`
- `copilot/sub-pr-33`

## Pull Request Workflow

### 1. Create Feature Branch

```bash
# Start from latest main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feat/my-new-feature
```

### 2. Make Changes

- Keep commits focused and atomic
- Write descriptive commit messages
- Test changes locally before pushing

**Commit Message Format:**
```
<type>(<scope>): <short summary>

<optional body>

<optional footer>
```

**Examples:**
```
feat(orders): add per-user order filtering

- Add createdByUid to order documents
- Filter queries based on user role
- Update OrderList component

Closes #123
```

```
docs(emulator): add role testing guide

Document steps for testing manager vs non-manager roles
using Firebase Emulator Suite.
```

### 3. Push and Open PR

```bash
git push origin feat/my-new-feature
```

**PR Title:** Should match the main commit or clearly describe the change
**PR Description:** Should include:
- What changed and why
- How to test the changes
- Screenshots (for UI changes)
- Checklist of completed work
- Related issues/PRs

### 4. PR Review Process

1. **Self-review:** Review your own diff before requesting review
2. **CI Checks:** Ensure all automated tests pass
3. **Request Review:** Tag appropriate reviewers
4. **Address Feedback:** Make requested changes
5. **Approval:** Get at least one approval before merging

### 5. Merge Strategy: **Squash and Merge**

**Why Squash Merge?**
- ✅ Clean, linear Git history
- ✅ One commit per feature/fix on main
- ✅ Easier to revert if needed
- ✅ Clear changelog/release notes

**How to Squash Merge:**

Via GitHub UI:
1. Click "Squash and merge" button on PR page
2. Edit the commit message if needed
3. Confirm merge

Via Command Line:
```bash
# Checkout main and update
git checkout main
git pull origin main

# Squash merge the feature branch
git merge --squash feat/my-new-feature

# Commit with descriptive message
git commit -m "feat: integrate my new feature

- Summary of changes
- Key improvements
"

# Push to main
git push origin main
```

**Commit Message for Squash Merge:**
```
<type>: integrate <branch-name>

- Key change 1
- Key change 2
- Key change 3

Closes #<PR-number>
```

**Examples:**
```
feat: integrate feat/remove-importmap-bundling

- Replace CDN imports with bundled Firebase SDK
- Improve build consistency
- Reduce client bundle size

Closes #54
```

```
docs: integrate feat/admin-hardening-docs

- Add security hardening documentation
- Document key rotation procedures
- Update deployment checklist

Closes #55
```

```
test: integrate tests/orderlist-copy-alignment

- Make OrderList tests resilient to DOM changes
- Add copy-safe query selectors
- Improve test reliability

Closes #39
```

### 6. Branch Cleanup

**Automatic Deletion:**
Enable "Automatically delete head branches" in GitHub repository settings.

**Manual Deletion:**
```bash
# Delete local branch
git branch -d feat/my-new-feature

# Delete remote branch
git push origin --delete feat/my-new-feature
```

**Bulk Cleanup** (after PR merges):
```bash
# List merged branches
git branch --merged main | grep -v "^\* main"

# Delete all merged branches locally
git branch --merged main | grep -v "^\* main" | xargs -n 1 git branch -d

# Delete remote branches (requires careful review)
# DO NOT RUN without manual verification:
git branch -r --merged main | grep -v "main" | sed 's/origin\///' | xargs -n 1 git push origin --delete
```

## Conflict Resolution

### When Conflicts Occur

1. **Update your branch** with latest main:
   ```bash
   git checkout feat/my-feature
   git fetch origin
   git merge origin/main
   # Resolve conflicts
   git commit
   git push
   ```

2. **Or rebase** (if you prefer linear history):
   ```bash
   git checkout feat/my-feature
   git fetch origin
   git rebase origin/main
   # Resolve conflicts
   git push --force-with-lease
   ```

3. **Request help** if conflicts are complex:
   - Tag a maintainer in the PR
   - Ask for guidance on merge strategy

### Conflict Prevention

- ✅ **Pull main frequently:** Keep your branch up to date
- ✅ **Small PRs:** Easier to review and less conflict-prone
- ✅ **Communicate:** Coordinate with team if working on related areas

## Branch Lifespan

- **Short-lived branches:** Aim for branches to live < 1 week
- **Long-lived branches:** If > 2 weeks, consider breaking into smaller PRs
- **Stale branches:** Delete branches that are > 1 month old with no activity

**Check for stale branches:**
```bash
# List branches not updated in 30 days
git for-each-ref --sort=-committerdate refs/heads/ --format='%(committerdate:short) %(refname:short)' | awk '$1 < "'$(date -d '30 days ago' +%Y-%m-%d)'"'
```

## Common Scenarios

### Scenario 1: Integrating Multiple Feature Branches

**Problem:** Multiple branches (feat/A, feat/B, feat/C) need to be consolidated.

**Solution:**
```bash
# Create consolidation branch from main
git checkout main
git pull origin main
git checkout -b feat/consolidated-features

# Cherry-pick or merge each feature (resolve conflicts as needed)
git merge --squash feat/A
git commit -m "feat: integrate A"

git merge --squash feat/B
git commit -m "feat: integrate B"

git merge --squash feat/C
git commit -m "feat: integrate C"

# Push and open PR
git push origin feat/consolidated-features
```

### Scenario 2: Hotfix to Production

**Problem:** Critical bug in production needs immediate fix.

**Solution:**
```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# Make minimal fix
# ... edit files ...

git add .
git commit -m "fix: critical bug in production"

# Push and open urgent PR
git push origin hotfix/critical-bug

# Fast-track review and merge with squash
```

### Scenario 3: Abandoned/Redundant Branch

**Problem:** Branch exists but work is no longer needed or already merged elsewhere.

**Action:**
```bash
# Verify branch is truly redundant
git log main..feat/abandoned-branch

# If no unique commits or work is obsolete:
git push origin --delete feat/abandoned-branch
git branch -d feat/abandoned-branch
```

## Protected Branch Settings (Recommended)

For `main` branch:

- ✅ Require pull request reviews before merging (minimum: 1 approval)
- ✅ Require status checks to pass (CI/CD)
- ✅ Require conversation resolution before merging
- ✅ Require linear history (enforce squash merges)
- ❌ Allow force pushes: Disabled
- ❌ Allow deletions: Disabled

## CI/CD Integration

### Pre-Merge Checks

All PRs should pass:
- ✅ Linting: `npm run lint`
- ✅ Unit Tests: `npm run test`
- ✅ E2E Tests: `npm run test:e2e`
- ✅ Build: `npm run build`

### Post-Merge Actions

After merge to `main`:
- Auto-deploy to production (Cloud Run)
- Update version badge
- Generate changelog entry

## Best Practices Summary

### DO ✅

- Create focused, single-purpose branches
- Use descriptive branch names
- Keep PRs small and reviewable (< 500 lines changed)
- Squash merge to main for clean history
- Delete branches after merging
- Pull main frequently to stay in sync
- Test locally before pushing
- Write meaningful commit messages

### DON'T ❌

- Commit directly to main
- Create long-lived branches (> 2 weeks)
- Force push to shared branches (unless rebasing your own feature branch)
- Merge without PR review
- Leave branches undeleted after merge
- Include unrelated changes in a PR
- Push broken code that fails tests

## Git Commands Cheat Sheet

```bash
# Create and switch to new branch
git checkout -b feat/my-feature

# Update branch with latest main
git pull origin main

# Stage and commit changes
git add .
git commit -m "feat: add new feature"

# Push to remote
git push origin feat/my-feature

# Squash merge (on main)
git merge --squash feat/my-feature
git commit -m "feat: integrate my feature"

# Delete local branch
git branch -d feat/my-feature

# Delete remote branch
git push origin --delete feat/my-feature

# View branch history
git log --oneline --graph --all --decorate

# Check branch status
git status
git branch -vv
```

## Troubleshooting

### Issue: "Updates were rejected" (Push Failed)

**Solution:**
```bash
git pull origin feat/my-feature --rebase
git push
```

### Issue: Accidentally Committed to Main

**Solution:**
```bash
# Create branch from current main state
git branch feat/accidental-work

# Reset main to remote state
git reset --hard origin/main

# Switch to new branch with your work
git checkout feat/accidental-work
```

### Issue: Need to Undo Last Commit

**Solution:**
```bash
# Undo commit but keep changes staged
git reset --soft HEAD~1

# Undo commit and unstage changes
git reset HEAD~1

# Undo commit and discard changes (DANGER!)
git reset --hard HEAD~1
```

## Related Documentation

- [Emulator Role Testing](./emulator-role-testing.md) - Testing changes locally before merge
- [Order Owner Migration](./order-owner-migration.md) - Running migrations after merges
- [GitHub Flow Guide](https://guides.github.com/introduction/flow/) - Official GitHub workflow documentation

## Enforcement

This is a **recommended** policy. Adjustments may be made as the team and project evolve. 

For questions or policy updates, open a discussion in the repository or contact a maintainer.
