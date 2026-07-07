# Unsecured Order Reminders

Vehicle-in-Need can email the salesperson every few days while an order is still active.

## What runs

- Cloud Run endpoint: `/jobs/unsecured-order-reminders`
- Sender: `scripts/allocation-email-watcher.gs` via Google Apps Script `MailApp`
- Default cadence: every 3 days per order
- Daily trigger: Apps Script runs once per day around 9 AM; Cloud Run decides which orders are actually due

## When an order is due

An order is due when all are true:

- Status is `Factory Order`, `Locate`, or `Dealer Exchange`
- `unsecuredReminderMuted` is not `true`
- `lastUnsecuredReminderAt` is older than `UNSECURED_REMINDER_EVERY_DAYS`
- If no reminder has been sent yet, `createdAt` or `date` is older than the cadence window

Reminders stop automatically when the order is marked secured (`Delivered`, `Received`, or UI `Secured`).

## Who gets emailed

The server resolves the recipient in this order:

1. `salespersonEmail` on the order, if present
2. A single active `users.displayName` match for the order `salesperson`
3. The order `createdByEmail`

It only sends to `@priorityautomotive.com` addresses. If a salesperson name matches multiple users, it falls back to the order owner instead of guessing.

## Apps Script setup

1. Open the existing allocation watcher project in Google Apps Script.
2. Replace `Code.gs` with `scripts/allocation-email-watcher.gs`.
3. Confirm Script Properties still include:
   - `CLOUD_FUNCTION_URL`
   - `ALLOCATION_API_KEY`
4. Optional Script Properties:
   - `REMINDER_EVERY_DAYS`: defaults to `3`
   - `REMINDER_MAX_PER_RUN`: defaults to `50`
   - `REMINDER_JOB_URL`: defaults to the live Cloud Run reminder job
   - `REMINDER_API_KEY`: defaults to `ALLOCATION_API_KEY`
5. Run `previewUnsecuredOrderReminders()` to see due reminders without sending email.
6. Run `setupUnsecuredReminderTrigger()` once to create the daily trigger.

## Firestore fields written after send

- `lastUnsecuredReminderAt`
- `unsecuredReminderCount`
- `unsecuredReminderLastEmail`

Set `unsecuredReminderMuted: true` on a specific order to suppress future reminders.
