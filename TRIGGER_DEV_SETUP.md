# Trigger.dev Dev Server Setup

## 1. Get Your Client ID

1. Open: https://app.trigger.dev/projects/proj_naaseftufwbqfmmzzdth/settings/dev-server
2. Copy the **Client ID** (format: `cli_xxxxx...`)
3. Edit `package.json` and replace `"GET_FROM_DASHBOARD"` with your Client ID:
   ```json
   "trigger.dev": {
     "endpointId": "cli_YOUR_ACTUAL_CLIENT_ID"
   }
   ```

## 2. Run Dev Server

```bash
TRIGGER_SECRET_KEY=tr_dev_oRC3HEciVw5eTiUrxnSE npm run trigger:dev
```

## 3. Test Webhook Delivery

```bash
# Create delivery
npx tsx scripts/create-test-delivery.ts https://c044b75acf85.ngrok-free.app/api/webhooks/outbound CLINIC_ID=dd9eb950-4ea6-4bb9-a10d-4171c48f620d

# Trigger delivery (use deliveryId from output above)
npx tsx scripts/dev-trigger-delivery.ts <deliveryId>
```

## 4. Validate

- Trigger.dev → Runs: see `deliver-webhook` with HTTP 2xx
- Next.js logs: see `[OUTBOUND WEBHOOK] headers=...`
- webhook.site or ngrok: see POST received

## Files Created/Updated

- `src/app/api/trigger/route.ts` - SDK endpoint for Dev Server
- `src/app/api/webhooks/outbound/route.ts` - Webhook receiver
- `package.json` - trigger:dev script and trigger.dev config
- `scripts/update-endpoint-url.ts` - Update endpoint URL helper
- `scripts/inspect-delivery.ts` - Inspect delivery details

## Environment Variables

```bash
# .env
TRIGGER_SECRET_KEY=tr_dev_oRC3HEciVw5eTiUrxnSE
DATABASE_URL=your_postgres_url
```

## Troubleshooting

- **404 on /api/trigger**: Restart Next.js (`npm run dev`)
- **Client ID error**: Update `package.json` with real Client ID from dashboard
- **ngrok URL changed**: Run `npx tsx scripts/update-endpoint-url.ts <endpointId> <new_ngrok_url>`
