# Gigs Together
[@GigsTogetherBot](https://t.me/GigsTogetherBot)

## Local development (frontend on subdomain in prod)

In production you’ll typically run:

- **Frontend**: `https://app.your-domain.tld`
- **API**: `https://api.your-domain.tld`

Locally, the simplest and most common approach is to run **frontend and backend on different ports**.

### Option A (recommended): different ports + CORS

- **API**: `http://localhost:3000`
- **Frontend**: `http://localhost:5173` (or whatever your frontend dev server uses)

Set API env:

- `CORS_ORIGINS="http://localhost:5173"`

Then in the frontend configure the API base URL as:

- `http://localhost:3000` (and call versioned endpoints like `/v1/...`)

### Option B: simulate subdomains locally (optional)

If you want URLs closer to production:

- **Frontend**: `http://app.localhost:5173`
- **API**: `http://api.localhost:3000`

On some systems `*.localhost` resolves automatically. If not, add to your hosts file:

- `127.0.0.1 app.localhost`
- `127.0.0.1 api.localhost`

Then set:

- `CORS_ORIGINS="http://app.localhost:5173"`

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

If your frontend is on another domain (e.g. `https://app.your-domain.tld`) and the API is on a subdomain (e.g. `https://api.your-domain.tld`), set:

- `CORS_ORIGINS="https://your-frontend.tld,https://another.tld"`

Or:

- `CORS_ORIGINS="*"` (no credentials)

#### Recommended setup (frontend on subdomain)

- **Frontend**: `https://app.your-domain.tld`
- **API**: `https://api.your-domain.tld`
- **Env**:
  - `CORS_ORIGINS="https://app.your-domain.tld"`
  - `APP_PUBLIC_BASE_URL="https://api.your-domain.tld"` (so stored URLs point to the API domain when needed)

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