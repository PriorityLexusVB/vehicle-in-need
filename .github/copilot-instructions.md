# Agent Rules (Repo-wide)

1. Prefer **MCP tools** over shell:

   - DB work → Supabase/Prisma MCP.
   - Repo/PR/issues → GitHub tools.
   - HTTP testing → use REST Client (or Thunder Client if present).

2. **Plan → Apply workflow**

   - Always propose a short PLAN (files, commands) before changes.
   - Wait for explicit "approve plan" before proceeding.

3. **Safety**

   - Default to read-only DB actions unless I say "write" or "migrate".
   - Never commit directly to `main`/`work`. Create `feat/...` or `setup/...` + PR.
   - Before any of: `git push`, `prisma migrate`, `supabase db push`, `firebase deploy`, `rm -rf`, print the command and ask for approval.

4. **Validation**

   - After edits: run lint/tests. For DB: `prisma validate` and `prisma migrate status` when Prisma is present.

5. **Environment awareness**
   - In Codespaces, use the dev container terminal; in WSL, use the remote WSL terminal.
