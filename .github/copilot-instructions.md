# Agent Rules (Repo-wide)

1) Prefer **Firebase CLI & Emulators** over raw shell for data/auth:

   - DB/storage/auth tasks → use Firebase CLI & Emulators (read-only by default; use `--project <dev>`).
   - Prefer emulator commands: `firebase emulators:start`, `firebase emulators:exec`.
   - Repo/PR/issues → GitHub tools.
   - HTTP testing → use REST Client (or Thunder Client if present).

2. **Plan → Apply workflow**

   - Always propose a short PLAN (files, commands) before changes.
   - Wait for explicit "approve plan" before proceeding.

3. **Safety**

   - Default to read-only DB actions unless I say "write" or "migrate".
   - Never commit directly to `main`/`work`. Create `feat/...` or `setup/...` + PR.
   - Before any of: `git push`, `firebase deploy`, `rm -rf`, or any rules write, print the command and ask for approval.

4. **Validation**

   - After edits: run lint/tests. For Firebase changes: prefer emulator-first validation (`firebase emulators:exec`).

5. **Environment awareness**
   - In Codespaces, use the dev container terminal; in WSL, use the remote WSL terminal.
