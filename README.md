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

#### Windows note (hosts file)

On Windows the hosts file is:

- `C:\Windows\System32\drivers\etc\hosts`

You’ll need admin privileges to edit it.

#### Do I need different ports?

By default, yes — you still run two processes, so they listen on different ports (e.g. `5173` and `3000`).

If you want *no ports* (closer to prod), run a local reverse proxy (optional), for example Caddy:

```
app.localhost {
  reverse_proxy 127.0.0.1:5173
}

api.localhost {
  reverse_proxy 127.0.0.1:3000
}
```

Then you can use:

- Frontend: `http://app.localhost`
- API: `http://api.localhost`

## Environments (dev/prod) and configs

This API loads env files based on `NODE_ENV`:

- If `NODE_ENV=dev` it loads (in order): `.env.dev`, `.env`
- If `NODE_ENV=prod` it loads (in order): `.env.prod`, `.env`

### Separate poster paths for dev/prod (S3 prefix)

Set:

- `S3_POSTERS_PREFIX=gigs-dev` in `.env.dev`
- `S3_POSTERS_PREFIX=gigs` in `.env.prod`

This affects upload and public URL building for gig poster images.

## Public bucket (Cloudflare R2 recommended)

The bucket is expected to be **public**. The API:

- Uploads posters into the bucket under the `S3_POSTERS_PREFIX` prefix.
- Stores only the object key path in DB as `Gig.poster.bucketPath` (e.g. `"/gigs/<uuid>-file.jpg"`).
- Returns a **direct public URL** to the object for clients (no proxy routes, no presigned URLs).

### Required env vars (S3 client + public base URL)

- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_REGION` (for R2 use `auto`)
- `S3_ENDPOINT` (for R2: `https://<accountid>.r2.cloudflarestorage.com`)
- `S3_FORCE_PATH_STYLE` (for R2 usually `true`)
- `S3_PUBLIC_BASE_URL` (public bucket base URL / CDN / custom domain)

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

### CORS for the Bucket (only needed if the browser fetches directly)

If the browser fetches objects directly from the public bucket domain (or uploads directly to the bucket), you must allow your frontend origin in the bucket CORS config.

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