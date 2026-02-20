# Hono + React + Cloudflare Workers Example

Full-stack WebAuthn demo using React (SPA) + Hono (API) on Cloudflare Workers, with KV storage and signed session cookies.

## Setup

```bash
cd examples/hono
npm install

# Create a KV namespace
npx wrangler kv namespace create WEBAUTHN_KV
# Copy the output id into wrangler.jsonc

# Set the cookie signing secret
npx wrangler secret put SECRET_KEY
```

## Development

```bash
npm run dev
# Opens at http://localhost:5173
```

## Deploy

```bash
npm run deploy
```

## Architecture

- **`src/react-app/`** — React SPA client. Uses `webauthx/client` for `Registration.create()` and `Authentication.sign()`.
- **`src/worker/`** — Hono API on Cloudflare Workers. Uses `webauthx/server` for `Registration.verify()` and `Authentication.verify()`.
- **KV** — Challenges stored with 5-min TTL; credentials persisted as JSON.
- **Sessions** — Hono signed cookies (`httpOnly`, `secure`, `SameSite=Lax`), signed with `SECRET_KEY`.

## Endpoints

| Method | Path                        | Description                                 |
| ------ | --------------------------- | ------------------------------------------- |
| `POST` | `/api/register/options`     | Generate registration challenge + options   |
| `POST` | `/api/register/verify`      | Verify credential, set session cookie       |
| `POST` | `/api/authenticate/options` | Generate authentication challenge + options |
| `POST` | `/api/authenticate/verify`  | Verify signature, refresh session cookie    |
| `GET`  | `/api/me`                   | Get current session (from signed cookie)    |
| `POST` | `/api/logout`               | Clear session cookie                        |
