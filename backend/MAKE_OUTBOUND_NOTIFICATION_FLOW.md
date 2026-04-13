# Make Outbound Notification Flow

This document is the current source of truth for outbound Make webhook behavior from the backend.

## Scope

- App-level notifications emitted through `notificationEvents.service.ts`
- Make delivery handoff in `notificationDelivery.service.ts`
- Contact reply emails sent through `email.service.ts` from `contact.controller.ts`

## Current Routing Strategy

- App creates notification rows via `notificationService.createNotifications`.
- If `sendToMake` is `true`, app builds delivery payloads and applies outbound guards.
- Payloads are sent to Make with `x-make-apikey` in `notificationDeliveryService`.
- Delivery status is updated to:
- `DELIVERED` when Make accepts payload.
- `FAILED` when Make responds non-2xx or request fails.
- `DISABLED` when webhook config is missing or payload is intentionally skipped.

## Field-Level Contract for Make

Use these fields in Make filters:

- `channelIntent`
- `eventType`
- `category`
- `status`
- `metadata.type`
- `metadata.userEmail`
- `metadata.toEmail`

Expected values:

- `channelIntent = "ops_alert"` for internal/staff operational alerts
- `channelIntent = "email"` only when payload is intended for email routing
- `channelIntent = "in_app_sync"` for app-only sync state (not Make-routed unless explicitly enabled)
- `eventType = "ORDER_CREATED"` for new order alerts
- `eventType = "CONTACT_REPLY_SENT"` for support reply notification events
- `metadata.type = "reply"` for direct reply-email style payloads sent by `email.service`

## Important Production Behavior

- The backend now blocks `channelIntent = "email"` notification payloads when neither `metadata.userEmail` nor `metadata.toEmail` is present.
- `CONTACT_REPLY_SENT` notification events are intentionally in-app only (`sendToMake = false`).
- Actual customer reply email delivery is performed by `emailService.sendReplyEmail(...)` with destination `toEmail = originalMessage.userEmail`.
- No production logic uses static test inbox addresses.

## Environment Requirements

Required:

- `MAKE_API_KEY`
- One webhook URL source: `MAKE_NOTIFICATION_WEBHOOK_URL_<CATEGORY>` (preferred per-category), `MAKE_NOTIFICATION_WEBHOOK_URL`, or `MAKE_WEBHOOK_URL` (global fallback)

## Change Summary (2026-04-12)

- Added app-side email destination guard before Make delivery for notification payloads.
- Marked unroutable email-intent notification payloads as `DISABLED`.
- Kept support reply notification events in-app only.
- Retained direct customer reply-email delivery through `email.service`.
- Replaced test-only `thestationhtx@gmail.com` fixtures with neutral addresses in tests.

## Verification

Automated backend verification:

```bash
npm --prefix backend run test
```

Result on 2026-04-12: all tests passed.
