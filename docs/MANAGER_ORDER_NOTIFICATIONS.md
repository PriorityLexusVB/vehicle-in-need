# Manager Order Notifications

Vehicle-in-Need can email active managers when new active orders are created, plus send a Monday weekly digest.

## Recipients

Recipients are not hardcoded in Apps Script.

The server uses active `users` documents where:

- `isManager === true`
- `isActive !== false`
- `email` ends with `@priorityautomotive.com`

To add or remove a recipient, update that person's Manager toggle or active status in the app's Settings page.

## Cloud Run Job

The protected endpoint is:

```text
POST /jobs/order-notifications
```

Supported actions:

- `new-orders` returns polished manager emails for new active orders.
- `ack-new-orders` records successful sends on each order.
- `weekly-digest` returns a weekly manager digest email.

New-order emails are only returned for orders that:

- have status `Factory Order`, `Locate`, or `Dealer Exchange`
- were created on or after `ORDER_NOTIFICATION_START_AT`
- do not already have `newOrderNotificationSentAt`
- do not have `newOrderNotificationMuted === true`

## Apps Script Functions

`scripts/allocation-email-watcher.gs` owns the Gmail/MailApp sender functions:

- `sendNewOrderNotifications()`
- `sendWeeklyOrderDigest()`
- `setupManagerOrderNotificationTriggers()`
- `previewManagerOrderNotifications()`
- `previewWeeklyOrderDigest()`

Run `setupManagerOrderNotificationTriggers()` once after pasting the latest script into Apps Script.

That creates:

- new-order checks every 5 minutes
- weekly digest on Mondays around 8 AM

## Script Properties

Set this required script property:

```text
ORDER_NOTIFICATION_API_KEY
```

It must match the Cloud Run `order-notification-key` Secret Manager value.

Optional overrides:

```text
ORDER_NOTIFICATION_JOB_URL
ORDER_NOTIFICATION_MAX_PER_RUN
```

Do not reuse `ALLOCATION_API_KEY`; manager notifications use a separate key because the endpoint returns manager-wide order data.

## Duplicate-Send Protection

The server reserves a new-order notification before Apps Script sends it. This prevents a second 5-minute trigger from sending the same manager email while the first run is still active.

Preview calls use `dryRun: true` and do not reserve orders.

If MailApp sends successfully, Apps Script acknowledges the send and the server writes the final sent fields. If MailApp fails before sending, Apps Script releases the reservation so the order can retry later.

## Firestore Fields

The server writes these fields while a notification is reserved:

```text
newOrderNotificationQueuedAt
newOrderNotificationQueueId
newOrderNotificationQueuedRecipientEmails
```

The server writes these fields after a new-order manager email is sent:

```text
newOrderNotificationSentAt
newOrderNotificationRecipientEmails
```

The server writes these fields if MailApp fails before sending:

```text
newOrderNotificationLastFailureAt
newOrderNotificationLastFailure
newOrderNotificationLastFailureRecipients
```

Set this field manually only when a specific order should never trigger a new-order manager email:

```text
newOrderNotificationMuted: true
```
