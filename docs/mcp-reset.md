# MCP Reset Guide (GitHub MCP Server)

This guide documents the steps to reset MCP authentication when experiencing issues such as:

- 401 errors when connecting to MCP
- Browser redirecting to `/authorize` instead of `/mcp/authorize`
- Persistent authentication failures

## Reset Procedure

### 1. Edit MCP Configuration

Edit the user MCP configuration file (not in the repository):

**Location:** `vscode-userdata:/User/mcp.json`

Replace or add the following configuration:

```json
{
  "github/github-mcp-server-v5": {
    "type": "http",
    "url": "https://api.githubcopilot.com/mcp"
  }
}
```

### 2. Clear Secret Storage

1. Open the Command Palette in VS Code
2. Run: **Developer: Open Secret Storage**
3. Remove any Copilot MCP auth entries

### 3. Reload VS Code

1. Open the Command Palette
2. Run: **Developer: Reload Window**
3. After reload, run: **GitHub Copilot: Restart MCP Servers**

### 4. Verify Network Access (Optional)

These commands will help verify connectivity (will return 401 without token, which is expected):

```bash
curl -I https://api.githubcopilot.com/mcp/health
curl -I https://api.githubcopilot.com/mcp/authorize
```

### 5. Trigger Authentication

After completing the above steps, trigger authentication again. The browser should now open to `/mcp/authorize` (not `/authorize`).

## Troubleshooting

### If `/mcp/authorize` still doesn't appear

1. Increment the server ID to `v6` in the MCP config:

   ```json
   {
     "github/github-mcp-server-v6": {
       "type": "http",
       "url": "https://api.githubcopilot.com/mcp"
     }
   }
   ```

2. Repeat steps 2-5 above

### If network fetch fails

Ensure that `api.githubcopilot.com` is allowlisted in your network environment.

## Notes

- This process forces a fresh metadata fetch with a new server ID
- The user MCP config file is outside the repository (user-level settings)
- The reset process does not affect repository code
- Authentication tokens are stored in VS Code's secret storage, not in git
