# Branch Relationships Visualization

## Branch Timeline

```
main (496b679) ─────────────────────────────────────────────────────────── [BASE]
                    │
                    ├─ [60 commits] ─── copilot/paste-firestore-rules-files (STALE)
                    │
                    ├─ [69 commits] ─── copilot/merge-paste-firestore-rules (STALE)
                    │
                    ├─ [83 commits] ─── copilot/sub-pr-165 (DELETE - superseded)
                    │
                    ├─ [84 commits] ─── copilot/fix-ci-failures-docs-ci-md (MERGE)
                    │                   │
                    │                   ├─── copilot/fix-docs-ci-md-lint (DELETE - duplicate)
                    │                   │
                    │                   └─── copilot/fixdocs-ci-md-lint (DELETE - duplicate)
                    │
                    ├─ [84 commits] ─── copilot/sub-pr-166 (MERGE FIRST - security)
                    │
                    ├─ [92 commits] ─── copilot/fix-cors-error-manager-role (ACTIVE)
                    │
                    └─ [1 commit] ──── copilot/compare-open-branches (MERGE LAST)
```

## Branch Categories

### 🔴 DELETE - Duplicates (3 branches)

```
copilot/fix-ci-failures-docs-ci-md  ─┬─ KEEP (most descriptive name)
                                     │
copilot/fix-docs-ci-md-lint  ────────┼─ DELETE (100% identical)
                                     │
copilot/fixdocs-ci-md-lint  ─────────┴─ DELETE (100% identical)
```

### 🔴 DELETE - Near-Duplicate (1 branch)

```
copilot/sub-pr-166  ─────────────────┬─ KEEP (security updates)
                                     │
copilot/sub-pr-165  ─────────────────┴─ DELETE (only express update)
```

### 🟡 DELETE - Stale (2 branches)

```
copilot/merge-paste-firestore-rules  ───── DELETE (only "Initial plan")
copilot/paste-firestore-rules-files  ───── DELETE (only "Initial plan")
```

### ✅ KEEP/MERGE (4 branches)

```
1. copilot/sub-pr-166 ───────────────────── MERGE (priority: HIGH)
2. copilot/fix-ci-failures-docs-ci-md ───── MERGE (priority: MEDIUM)
3. copilot/fix-cors-error-manager-role ──── MERGE (priority: MEDIUM, needs rebase)
4. copilot/compare-open-branches ────────── MERGE (priority: LOW, this analysis)
```

## Commit Divergence from Main

```
 0      20     40     60     80     100
 ├──────┼──────┼──────┼──────┼──────┤
 │                                         
main ●                                      
     │                                      
     ├─────────────────────────────────●   paste-firestore-rules-files (60)
     │                                      
     ├────────────────────────────────────●  merge-paste-firestore-rules (69)
     │                                      
     ├──────────────────────────────────────●  sub-pr-165 (83)
     │                                      
     ├──────────────────────────────────────●  fix-ci-failures-docs-ci-md (84)
     │                                      │
     │                                      ●  fix-docs-ci-md-lint (84)
     │                                      │
     │                                      ●  fixdocs-ci-md-lint (84)
     │                                      
     ├──────────────────────────────────────●  sub-pr-166 (84)
     │                                      
     ├───────────────────────────────────────●  fix-cors-error-manager-role (92)
     │                                      
     ●  compare-open-branches (1)
```

## File Change Overlap

### High Overlap (Modified by 6+ branches)

- `package.json` / `package-lock.json` - ALL branches
- `firestore.rules` - 6 branches
- `components/Login.tsx` - 6 branches
- `README.md` - 6 branches
- `DEPLOYMENT_GUIDE.md` - 6 branches

### Medium Overlap (Modified by 3-5 branches)

- `App.tsx` - 4 branches
- `docs/CI.md` - 3 branches (duplicates)
- `components/OrderCard.tsx` - 6 branches
- `constants.ts` - 6 branches

### Low Overlap (Modified by 1-2 branches)

- Most test files
- Individual component files
- Documentation in `docs/` directory

## Merge Conflict Risk Assessment

### 🔴 HIGH RISK

**Files:** `package.json`, `package-lock.json`
**Branches:** ALL (especially sub-pr-165, sub-pr-166, fix-cors-error-manager-role)
**Mitigation:** Merge in priority order, regenerate lock files after each merge

### 🟡 MEDIUM RISK

**Files:** `firestore.rules`, `components/Login.tsx`, `App.tsx`
**Branches:** 4-6 branches modify these
**Mitigation:** Manual review required during merge

### 🟢 LOW RISK

**Files:** Documentation files, test files
**Branches:** Various
**Mitigation:** Standard merge process

## Recommended Action Sequence

```
START
  │
  ├─ Phase 1: Safe Deletions (5 minutes)
  │   ├─ Delete: copilot/fix-docs-ci-md-lint
  │   ├─ Delete: copilot/fixdocs-ci-md-lint
  │   └─ Delete: copilot/sub-pr-165
  │
  ├─ Phase 2: Archive & Delete Stale (10 minutes)
  │   ├─ Tag: archive/merge-paste-firestore-rules
  │   ├─ Tag: archive/paste-firestore-rules-files
  │   ├─ Delete: copilot/merge-paste-firestore-rules
  │   └─ Delete: copilot/paste-firestore-rules-files
  │
  ├─ Phase 3: Merge Priority Order (2-3 hours)
  │   ├─ 1. Merge: copilot/sub-pr-166
  │   │   └─ Test: Run CI/CD pipeline
  │   │
  │   ├─ 2. Merge: copilot/fix-ci-failures-docs-ci-md
  │   │   └─ Test: Run linters
  │   │
  │   ├─ 3. Rebase: copilot/fix-cors-error-manager-role on main
  │   │   └─ Merge: copilot/fix-cors-error-manager-role
  │   │       └─ Test: Run full test suite
  │   │
  │   └─ 4. Merge: copilot/compare-open-branches
  │       └─ Test: Verify documentation
  │
  └─ COMPLETE
      └─ Final verification: All branches cleaned up
```

## Summary Statistics

| Metric | Value |
| ------ | ----- |
| Total branches analyzed | 9 |
| Branches to delete | 5 (56%) |
| Branches to merge | 4 (44%) |
| Duplicate branches | 3 |
| Stale branches | 2 |
| Active branches | 1 |
| Total commits across all branches | 660 |
| Unique commits (estimate) | ~150 |
| Duplicate commits (estimate) | ~510 |

## Notes

- **Merge conflicts are expected** in `package.json` and `package-lock.json`
- **Manual testing required** after merging branches with code changes
- **Documentation review** recommended after all merges
- **Backup tags created** for stale branches before deletion
- **No data loss** expected from any deletions

---

See also:

- [BRANCH_ANALYSIS.md](./BRANCH_ANALYSIS.md) - Detailed analysis
- [BRANCH_ANALYSIS_SUMMARY.md](./BRANCH_ANALYSIS_SUMMARY.md) - Quick reference
