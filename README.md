# Gigs Together
[@GigsTogetherBot](https://t.me/GigsTogetherBot)

## Railway Bucket: public access via presigned URLs (and CORS)

Railway Storage Buckets are **private**. To display uploaded images to unauthenticated users, this API exposes:

- **`GET /photos`**: lists gig poster images as **presigned GET URLs** (browser loads directly from the bucket).
- **`GET /public/files/:key(*)`**: stable public URL that **302-redirects** to a presigned URL.
- **`GET /public/files-proxy/:key(*)`**: stable public URL that **proxies bytes** through the API (useful for Telegram/bots that don’t like redirects).

### Required env vars (S3 client)

Use Railway Bucket Variable References (recommended) or set manually:

- `S3_BUCKET` (Railway: use `BUCKET`)
- `S3_ACCESS_KEY_ID` (Railway: `ACCESS_KEY_ID`)
- `S3_SECRET_ACCESS_KEY` (Railway: `SECRET_ACCESS_KEY`)
- `S3_REGION` (Railway: `REGION`, usually `auto`)
- `S3_ENDPOINT` (Railway: `ENDPOINT`, usually `https://storage.railway.app`)
- `S3_FORCE_PATH_STYLE` (`false` for most new Railway buckets; see Bucket Credentials tab)

Optional:

- `S3_PRESIGN_EXPIRES_IN` (seconds, default 3600)
- `APP_PUBLIC_BASE_URL` (e.g. `https://your-service.up.railway.app`) so stored `Gig.photo.url` becomes absolute

### CORS for the API

If your frontend is on another domain, set:

- `CORS_ORIGINS="https://your-frontend.tld,https://another.tld"`

Or:

- `CORS_ORIGINS="*"` (no credentials)

### CORS for the Bucket (only needed for browser uploads / fetch)

If the browser uploads directly to the bucket (presigned POST/PUT) or fetches presigned URLs via `fetch`, you must allow your frontend origin in the bucket CORS config. Railway docs: [Storage buckets → presigned URLs](https://docs.railway.com/guides/storage-buckets#upload-files-with-presigned-urls).

Example (adjust origins/methods as needed):

```bash
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... aws s3api put-bucket-cors \
  --bucket "$S3_BUCKET" \
  --endpoint-url "$S3_ENDPOINT" \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET","HEAD","PUT","POST"],
        "AllowedOrigins": ["https://your-frontend.tld"],
        "MaxAgeSeconds": 3000
      }
    ]
  }'
```