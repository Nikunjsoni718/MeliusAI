# Web Push deployment

Web Push uses one stable VAPID key pair. Generate it once from a trusted local
machine after installing `backend/requirements.txt`:

```powershell
python backend/generate_vapid_keys.py
```

Copy the printed values into the Render backend environment as:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT` (a monitored `mailto:` address)

Do not commit the private key and do not rotate keys during normal deploys:
rotation invalidates existing browser subscriptions. The Next.js client reads
only the public key through the FastAPI endpoint. Ensure `CORS_ALLOWED_ORIGINS`
contains every deployed frontend origin, and keep the existing Render
`/api/cron/process-notifications` schedule running every minute for retries.
