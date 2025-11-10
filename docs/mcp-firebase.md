<!-- markdownlint-disable MD013 -->
<!-- Long lines intentional for table formatting -->

# Firebase MCP Server

This document describes the custom MCP server used to expose limited Firestore capabilities via JSON-RPC over stdio.

## Provided Methods

| Method                      | Params                                               | Description                                                                          |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ping`                      | none                                                 | Health check; returns `{ ok: true, ts }`                                             |
| `firestore.listCollections` | none                                                 | Lists root-level collection IDs                                                      |
| `firestore.getDoc`          | `{ path: string }`                                   | Fetches a document at a slash path like `users/uid` or `orders/orderId/subcol/subId` |
| `firestore.queryCollection` | `{ collection: string, where?: [field, op, value] }` | Simple query with single where; returns up to 50 docs                                |

## Path Rules

Document paths must have an even number of segments (collection/doc[/collection/doc...]). Invalid paths return an error.

## Environment Variables

Set in `mcp.json` for the server:

- `FIREBASE_SERVICE_ACCOUNT_FILE` → Path to service account JSON (gitignored)
- `FIREBASE_PROJECT_ID` → Explicit project id (`vehicles-in-need`)
- (Optional) `FIREBASE_SERVICE_ACCOUNT_JSON` if inline JSON is ever required (avoid unless necessary).

## Security

- Service account JSON lives in `.secrets/` (already gitignored). Never commit it.
- The server only implements read/query operations; no writes are exposed.

## Example JSON-RPC Messages

Request:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "firestore.listCollections" }
```

Response:

```json
{ "jsonrpc": "2.0", "id": 1, "result": ["users", "orders"] }
```

Get a doc:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "firestore.getDoc",
  "params": { "path": "users/abc123" }
}
```

Query:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "firestore.queryCollection",
  "params": { "collection": "orders", "where": ["status", "==", "OPEN"] }
}
```

## Verification Checklist

1. Reload VS Code window after updating `mcp.json`.
2. Call `ping` → expect `{ ok: true }`.
3. Call `firestore.listCollections` → expect known collections.
4. Call `firestore.getDoc` with existing user doc → `exists: true`.
5. Call with non-existent doc → `exists: false`.
6. Run a query with a where clause; verify limited (≤50) results.
7. Confirm errors: malformed JSON, invalid path, method not found.

## Troubleshooting

| Symptom                         | Resolution                                                       |
| ------------------------------- | ---------------------------------------------------------------- |
| `Missing service account` error | Ensure `FIREBASE_SERVICE_ACCOUNT_FILE` path correct and readable |
| Empty collection list           | Verify Firestore has root collections; check project id          |
| `Invalid document path`         | Ensure even segment count: `collection/doc`                      |
| Parse error responses           | Ensure each JSON-RPC request is on a single line                 |

## Future Extensions

- Add batched `firestore.getDocs` for multiple paths.
- Add limited write operations (create/update) behind an explicit allowlist.
- Implement structured logging and metrics counters.
