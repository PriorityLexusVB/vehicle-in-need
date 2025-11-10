# Coding Agent Prompt: Admin Hardening & Documentation Completion

This file captures the full execution instructions for an automated coding agent to finalize remaining tasks for the **admin hardening & documentation** effort on branch `feat/admin-hardening-docs`.

## Branch Context

- Active feature branch: `feat/admin-hardening-docs`
- Base branch: `main`
- Completed changes so far:
   - Auth loop fix (popup-first, redirect fallback)
   - Access Denied state (domain normalization) without infinite sign-out loop
   - Standardized `[ROLE-ELEVATION] email=<email> uid=<uid> elevated=true` logging using a ref to avoid duplicates
   - Removed explicit `any` types from targeted files (`OrderCard.tsx`, `OrderList.tsx`, `geminiService.ts`, `types.ts`, crypto tests)
   - Firebase MCP server implemented (`mcp/firebase-v5/index.mjs`) and documented (`docs/mcp-firebase.md`)
   - ZeroManagerWarning component + tests (dismiss & accessibility)

## Objective

Finish remaining hardening tasks: markdown cleanup, security/key rotation docs, deployment role verification steps, role UI examples doc, final quality gates, and prepare the comprehensive Pull Request.

## Constraints

- Do NOT regress authentication or elevation logic.
- No new external dependencies unless absolutely required.
- Keep secrets out of version control (`.secrets/` remains gitignored).
- Minimize rewrite scope; apply surgical documentation and minor code adjustments only.
- Tests must continue to pass (current baseline: 50 passed / 4 skipped).
- Use markdownlint disable only for MD013 (line length) where necessary.

## Task List

1. Markdown Documentation Cleanup
2. Security & Key Rotation Docs
3. Deployment Checklist Enhancement
4. Role UI Examples Doc
5. Final Quality Gates (lint, md-lint, tests, build)
6. Pull Request Preparation

---
## 1. Markdown Documentation Cleanup

Apply these fixes across the listed markdown files.

### Files to Adjust MD013 (Line Length)

Add at the very top (after any existing title) two lines:

```text
<!-- markdownlint-disable MD013 -->
<!-- Long lines intentional for readability / tables / list formatting. -->
```

Target files:

- `README.md`
- `DEPLOYMENT_CHECKLIST.md`
- `IMPLEMENTATION_SUMMARY.md`
- `MANUAL_TESTING_STEPS.md`
- `DOCKER_BUILD_NOTES.md`
- `UI_NAVIGATION_SUMMARY.md`
- `.github/copilot-instructions.md`
- `docs/mcp-firebase.md`
- `docs/git-repair.md`
- `docs/mcp-reset.md`
- `docs/role-ui-examples.md` (after creation)

### MD040 (Fenced Code Blocks Need Language)
Add appropriate languages:

- Shell commands: `bash`
- JSON examples: `json`
- YAML examples: `yaml`
- TypeScript/TSX snippets: `typescript`
- Diff snippets (if present): `diff`
- Plain output/logs: use `text`

### MD041 (Top-level Heading First Line)
Ensure `docs/MCP-NOTES.md` starts with an H1 (`# MCP Notes`) and then content.

### MD036 (Emphasis Used as Heading)
In `MANUAL_TESTING_STEPS.md` and `IMPLEMENTATION_SUMMARY.md`, replace emphasized pseudo-headings (e.g., lines starting with `*Option A:` or single-line bold/italic styles acting as a heading) with `###` or `####` level headings.

### MD024 (Duplicate Headings)
In `IMPLEMENTATION_SUMMARY.md`, rename duplicates:
- "Files Modified" → "Files Modified (Initial)" / "Files Modified (Follow-up)"
- "Problem Statement" if repeated → add suffix such as "Problem Statement (Context)".
- "Benefits" duplicates → "Benefits (Phase 1)" / "Benefits (Current)".

### MD033 (Inline HTML)
Replace `<short-sha>` and `<build-time>` with backticks: ``short-sha`` and ``build-time``.

### General
Ensure each fenced block has blank line preceding and following (avoid MD031).

---
## 2. Security & Key Rotation Docs

### README.md
Add section near security-related content (near deployment or setup) titled:
`## Security & Key Rotation`
Include:
1. Purpose of rotating Firebase service account keys.
2. Steps:
   - Revoke old key in Firebase Console.
   - Generate new key for minimal-scope service account.
   - Save JSON to `.secrets/vin-seeder.json` (already gitignored).
   - Optionally export `GOOGLE_APPLICATION_CREDENTIALS` locally for server-side operations.
   - Run `pnpm run seed:managers:dry-run -- --emails manager@priorityautomotive.com` to verify.
3. Never commit the JSON key file.
4. Suggest periodic (e.g., quarterly) rotation and immediate rotation on suspected exposure.
5. Provide example commands:
```bash
ls -l .secrets/vin-seeder.json
grep -i project_id .secrets/vin-seeder.json
pnpm run seed:managers:dry-run
```

### MANUAL_TESTING_STEPS.md
Add subsection: `### Service Account Key Rotation` summarizing the README steps with a short checklist.

---
## 3. Deployment Checklist Enhancement

In `DEPLOYMENT_CHECKLIST.md` add `## Admin/Role Verification` section containing:
- Run seeder dry-run to confirm manager(s) presence.
- Login with known manager; confirm admin nav visible; ensure no new `[ROLE-ELEVATION]` log appears.
- Login with non-manager; admin nav absent.
- Simulate zero-manager state (temporarily unset all `isManager` or use test environment); verify ZeroManagerWarning appears and dismiss works.
- Test unauthorized domain (set env override off) shows Access Denied page without loop.
- Confirm version + build time appear in console logs.

---
## 4. Role UI Examples Doc

Create `docs/role-ui-examples.md` if missing.
Content blocks with fenced `text` code style showing simplified DOM/text states:
- Manager view snippet (header shows admin nav items, Add New Order button, DashboardStats).
- Non-manager view (Submit New Vehicle Request heading; absence of admin nav; presence of OrderForm only).
- Zero-manager warning snippet (alert block with dismiss button aria-label).
Add a short table summarizing which elements appear per role state.

---
## 5. Final Quality Gates

Run commands:
```bash
pnpm install
pnpm eslint .
pnpm markdownlint-cli2 "**/*.md" "#node_modules"
pnpm test --run
pnpm build
```
Acceptance:
- ESLint: 0 errors (warnings acceptable only for external modules we intentionally ignore).
- Markdownlint: Only MD013 remaining in files where disabled (others resolved).
- Tests: All previously passing remain passing; new tests (if any) pass.
- Build: succeeds without new warnings.

Capture outputs for PR body (summarize counts; do not paste full logs unless needed).

---
## 6. Pull Request Preparation

Title: `Admin Hardening & Docs Cleanup`

Body Template Sections:
1. Summary
2. Changes
   - Auth loop remediation & Access Denied screen
   - Elevation logging standardization
   - Type safety improvements (removed explicit any)
   - Firebase MCP server & docs
   - Markdown lint cleanup & MD013 rationale comments
   - Security & key rotation documentation
   - Deployment admin verification steps
   - Role UI examples documentation
3. Verification
   - Test suite summary (pass counts)
   - Lint & build status
4. Seeder Usage Example (dry-run + apply commands)
5. Security & Rotation Notes (excerpt from README)
6. Role/UI Snapshots (text snippets from role-ui-examples doc)
7. Risks & Rollback (note revert commit can restore previous login flow; documentation changes low-risk)
8. Post-Merge Checklist (rotate keys if needed, verify production domain list, optional enable domain override flag removal)

Commit message style for final docs commit: `docs(admin): markdown cleanup, security rotation section, deployment verification`

---
## Implementation Order (Reiterated)
1. Apply markdown changes & create new docs.
2. Add security sections (README, MANUAL_TESTING_STEPS).
3. Extend DEPLOYMENT_CHECKLIST.md.
4. Create role UI examples doc.
5. Run quality gate commands; adjust if failures.
6. Commit & push.
7. Open PR with prepared body.

---
## Edge Cases / Notes
- Leave existing elevation logic intact; only change logging format already standardized.
- Do not alter Firestore collection names or queries.
- Avoid adding write operations to MCP Firebase server (read-only as documented).
- If markdownlint still flags MD031/MD022 ensure blank lines around headings/tables/code blocks.
- If ESLint flags CDN import typing, consider adding a `// @ts-ignore` directly above those lines (document rationale in PR under "Changes").

---
## Completion Criteria
PR open with full body sections; tests & build green; docs updated; only MD013 disabled intentionally; no secrets committed; branch up to date with stated changes.

---
## Optional Enhancements (Defer unless requested)
- Add a small integration test for Access Denied page (domain mismatch) using jsdom (would require adjustable domain mock).
- Add screenshot automation via Playwright (out of scope unless requested).

---
End of execution prompt.
