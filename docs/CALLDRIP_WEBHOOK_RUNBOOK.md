# CallDrip Webhook Runbook

> **Additive feature** — does NOT affect existing order tracking, manager
> features, auth flows, or UI behavior.

## Overview

This backend receives CallDrip webhook events and stores them durably in
Firestore for later export to `bdc-agent`.

| Item | Value |
| ------ | ------- |
| Webhook path | `POST /webhooks/calldrip/v1/events` |
| Status path | `GET /api/calldrip/status` |
| Feature flag | `CALLDRIP_ENABLE_WEBHOOK=true` |
| Raw events collection | `calldrip_raw_events` |
| Status document | `system_ingestion/calldrip_status` |

## Required Environment Variables

| Variable | Required | Description |
| ---------- | ---------- | ------------- |
| `CALLDRIP_ENABLE_WEBHOOK` | Yes | Set to `true` to activate webhook routes |
| `CALLDRIP_WEBHOOK_SECRET` | Yes (when enabled) | Shared secret for authenticating inbound webhooks |
| `GOOGLE_CLOUD_PROJECT` | Recommended | GCP project ID (auto-detected on Cloud Run) |

## Authentication

### Webhook Request Auth

CallDrip must send one of:

```
Authorization: Bearer <CALLDRIP_WEBHOOK_SECRET value>
```

or:

```
X-CallDrip-Token: <CALLDRIP_WEBHOOK_SECRET value>
```

### Local Development Auth (Firestore)

Use Application Default Credentials:

```bash
gcloud auth application-default login
```

This grants the local process Firestore access using your Google account.

**Fallback (if ADC is not feasible):** Download a service account key JSON,
set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`. Never commit this file.

### Cloud Run Production Auth (Firestore)

Cloud Run uses its runtime service account automatically. No key files needed.

Ensure the Cloud Run service account has:

- `roles/datastore.user` (Firestore read/write)

## CallDrip Configuration

In the CallDrip admin panel, configure the webhook URL:

```
https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/webhooks/calldrip/v1/events
```

Set the auth header to:

```
Authorization: Bearer <your-chosen-secret>
```

Use the same secret value you set in `CALLDRIP_WEBHOOK_SECRET` on Cloud Run.

## Cloud Run Deployment

Set env vars on the Cloud Run service:

```bash
gcloud run services update pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --set-env-vars="CALLDRIP_ENABLE_WEBHOOK=true,CALLDRIP_WEBHOOK_SECRET=<secret>"
```

Or add them in the Cloud Run console under **Variables & Secrets**.

## Local Testing

Start the server with the feature enabled:

```bash
# Windows PowerShell
$env:CALLDRIP_ENABLE_WEBHOOK="true"
$env:CALLDRIP_WEBHOOK_SECRET="test-secret-local"
npm run server

# Bash / WSL
CALLDRIP_ENABLE_WEBHOOK=true CALLDRIP_WEBHOOK_SECRET=test-secret-local npm run server
```

Send a test webhook:

```bash
curl -X POST http://localhost:8080/webhooks/calldrip/v1/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-secret-local" \
  -d @server/test/fixtures/calldrip-sample-event.json
```

Check status:

```bash
curl http://localhost:8080/api/calldrip/status
```

## First Live Event Verification

1. Deploy with `CALLDRIP_ENABLE_WEBHOOK=true` and `CALLDRIP_WEBHOOK_SECRET` set
2. Configure CallDrip to point at the webhook URL above
3. Trigger a test event in CallDrip
4. Check `GET /api/calldrip/status` — `eventsReceivedCount` should increment
5. Check Firestore console → `calldrip_raw_events` collection for the new doc
6. Check `system_ingestion/calldrip_status` document for timestamps

## Idempotency

Duplicate webhook deliveries are handled safely:

1. If CallDrip sends a vendor `event_id` / `calldrip_event_id`, that ID is the
   dedupe key
2. Otherwise, a composite hash of `call_id + person_id + occurred_at` is used
3. As a last resort, a SHA-256 of the full payload is used

Duplicate events return `200 OK` with `{ duplicate: true }` — they do **not**
create duplicate Firestore documents.

## What Remains for `bdc-agent`

- [ ] Export bridge: read `calldrip_raw_events` where `processed === false`
- [ ] Mark events `processed: true` after successful export
- [ ] Connect `bdc-agent` pipeline to consume from this collection
- [ ] Optional: add Pub/Sub notification on new events for real-time push

## File Map

| File | Purpose |
| ------ | --------- |
| `server/index.cjs` | Route mounting (lines ~102-120) |
| `server/src/lib/firebaseAdmin.cjs` | Shared Firebase Admin singleton |
| `server/src/lib/calldripStore.cjs` | Firestore storage layer |
| `server/src/handlers/calldripWebhook.cjs` | POST webhook handler |
| `server/src/handlers/calldripStatus.cjs` | GET status handler |
| `server/test/fixtures/calldrip-sample-event.json` | Test fixture |
| `server/__tests__/calldrip.test.ts` | Automated tests |
