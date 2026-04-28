---
name: webauthx
description: Set up production-ready WebAuthn passkey authentication using webauthx. Use when adding passkey auth, WebAuthn registration, or WebAuthn authentication to an app.
---

# webauthx

Set up production-ready WebAuthn passkey ceremony orchestration using `webauthx`.

Read `README.md` for the full API reference. Read `examples/hono/` for a simplified reference implementation. The example prioritizes clarity over production hardening, so follow this checklist for production.

## Setup

Install `webauthx` and import from `webauthx/server` and `webauthx/client`.

## Registration Flow (Sign Up)

1. **Server:** call `Registration.getOptions({ name, rp })`. Returns `{ challenge, options }`.
2. Store the `challenge` server-side (signed cookie, DB, or KV). Must be single-use and short-lived (≤5 min).
3. **Client:** pass `options` to `Registration.create({ options })`. Triggers the browser passkey prompt. Must be called from a user gesture (click/tap).
4. **Client:** POST the returned credential to the server.
5. **Server:** consume the stored challenge, then call `Registration.verify(credential, { challenge, origin, rpId })`.
6. Persist `result.credential.id` and `result.credential.publicKey` associated with the user.

## Authentication Flow (Log In)

1. **Server:** call `Authentication.getOptions({ credentialId, rpId })`. Returns `{ challenge, options }`.
2. Store the challenge. Same rules as registration: single-use, short-lived, server-side.
3. **Client:** pass `options` to `Authentication.sign({ options })`. Must be user-initiated.
4. **Client:** POST the returned response to the server.
5. **Server:** consume the stored challenge, look up the stored `publicKey` by `response.id`, then call `Authentication.verify(response, { challenge, publicKey, origin, rpId })`.
6. On success, mint a new session (rotate any existing session ID).

## Best Practices

### Endpoints

- Keep challenge generation and verification as separate routes (e.g. `POST /register/options` + `POST /register/verify`). Don't combine them into a single endpoint.

### Cookies

- Use separate cookies for challenges and sessions with different names and TTLs. Challenge cookies are short-lived (≤5 min) and consumed on verify. Session cookies are long-lived and persist across requests.
- Always set `HttpOnly`, `Secure`, `SameSite: 'Lax'`, and `Path: '/'` on both. Use signed cookies to prevent tampering.
- Don't store user data in the session cookie. Store a session ID or credential ID, and look up the rest server-side. Keeps cookies small and avoids stale data.

### Auth Middleware

- Protect authenticated routes with middleware that reads the session cookie, looks up the credential/user, and returns 401 if invalid.
- Keep it generic: check session, load user context, call next. Don't put business logic in the middleware.
- See `examples/hono/` for a reference pattern.

### UX

- `Registration.create` and `Authentication.sign` must be called from a click/tap handler. Browsers reject unprompted WebAuthn calls.
- Handle cancellation gracefully. Users can dismiss the passkey prompt at any time. Catch the error and let them retry without reloading the page.
- Let users register multiple passkeys so they aren't locked out if they lose a device.
- Show a passkey management UI where users can see their registered credentials (`credentialId`, `createdAt`, `lastUsedAt`) and remove ones they don't recognize.

### rpId

- Keep `rp.id` stable. Changing your rpId invalidates all existing credentials. Pick it once.

## Security Checklist

Follow every item below for production deployments.

### Transport

- WebAuthn only works over HTTPS (`localhost` is the only exception).
- Set `Strict-Transport-Security` with `includeSubDomains` and `preload`.
- Set `Cache-Control: no-store` on all ceremony endpoints.

### Origin & rpId

- Hardcode `origin` and `rpId` on the server. Never accept them from the client or derive from request headers.
- `rpId` is a registrable domain (e.g. `example.com`), no scheme, no path. To share passkeys across subdomains, use the parent domain.
- `origin` must exactly match what the browser sends (e.g. `https://app.example.com`). For multiple origins, use a strict allowlist.

### Challenge Lifecycle

- Challenges are single-use. Consume (delete) the challenge on the first verification attempt, whether it succeeds or fails.
- Expire challenges after 1-5 minutes (the Hono example uses 300s).
- Store challenges server-side in a signed cookie, database, or KV store. Never trust the client to provide the challenge.
- Where possible, bind the challenge to the ceremony type (`registration` vs `authentication`), the user, and the expected rpId/origin.
- Issuing a new challenge should invalidate any prior outstanding challenge for the same session/operation.

### Challenge Storage (Cookies)

If using cookies to store challenges (like the Hono example):

- `HttpOnly: true` to prevent JavaScript access.
- `Secure: true` so it's only sent over HTTPS.
- `SameSite: 'Lax'` (or `'Strict'` if UX allows).
- `Path: '/'` or scoped narrowly to ceremony endpoints.
- Short `maxAge` matching your challenge TTL.
- Signed cookies prevent tampering but not reading. Challenge secrecy isn't critical, but cookie theft enables replay within TTL, so keep TTLs short.

### User Identity

- `user.id` must be a stable, opaque, non-PII identifier (raw bytes, ≤64 bytes). Don't use email or username directly as the user handle since this leaks PII to authenticators.
- Reuse the same `user.id` for the account across registrations.

### Registration

- Explicitly set `userVerification: 'required'` for passkey-grade assurance. Don't rely on defaults since they may vary across libraries and spec versions.
- Set `attestation: 'none'` unless you have a specific business need for device provenance. Attestation validation is complex and easy to get wrong.
- Use `excludeCredentialIds` to prevent duplicate registration with the same authenticator.
- If registering a credential for an existing account, require an authenticated session. Otherwise an attacker could attach their passkey to a victim's account.

### Authentication

- Explicitly set `userVerification: 'required'`.
- allowCredentials flow (username-first): set `credentialId` to scope the browser prompt. Account enumeration risk comes from whether the server reveals "user exists", so mitigate with generic responses and rate limiting.
- Discoverable credentials (passkey-first): omit `credentialId` and map `response.id` to a user server-side.

### Session Management

- Rotate the session ID on auth. After successful verification, mint a new session and invalidate the old one to prevent session fixation.
- Session cookies: `HttpOnly`, `Secure`, `SameSite`, shortest acceptable TTL.
- For sensitive actions, require recent WebAuthn verification (e.g. within 5 minutes).
- Logout:
  - Stateful sessions (session ID mapped to server-side record): invalidate the record, not just the cookie.
  - Stateless sessions (signed cookie): deleting the cookie is the only option. Stolen cookies remain valid until expiry. Consider a server-side revocation list for high-security apps.

### CORS & CSRF

- Lock down CORS on ceremony endpoints. Don't use `Access-Control-Allow-Origin: *` with credentials.
- If your frontend and API are on different origins, allowlist exact origins and require CSRF tokens (double-submit cookie or server-stored). `SameSite` cookies alone are not sufficient for cross-origin credentialed requests.

### Clickjacking

- Set `Content-Security-Policy: frame-ancestors 'none'` (or a strict allowlist) on pages that initiate ceremonies.
- Consider `Permissions-Policy: publickey-credentials-create=(self), publickey-credentials-get=(self)` to restrict where WebAuthn can be called.

### Error Handling

- Return generic errors to clients. Don't distinguish between "unknown credential" and "verification failed" for unauthenticated callers since this leaks account enumeration info. Log specifics server-side only.
- Never log raw credential responses, challenges, or session cookies.

### Rate Limiting

- Rate limit all ceremony endpoints per IP and per account.
- Use progressive backoff on repeated failures.

### Credential Storage

Persist per credential (minimum):

- `credentialId`: stable identifier
- `publicKey`: hex-encoded P-256 public key from `Registration.verify`
- `userId`: associated user account
- `createdAt` / `lastUsedAt`: for audit and UX

Optional (not currently exposed by webauthx, use `ox/webauthn` directly if needed):

- `signCount`: track and validate to detect cloned authenticators
- `transports`: for UX hints (USB, NFC, BLE, internal)
- `backupEligible` / `backupState`: for risk-scoring synced vs hardware-bound passkeys

### Recovery

- Encourage multiple credentials per account so users can register multiple passkeys/devices.
- Provide a recovery path that isn't weaker than your threat model (e.g. verified email + rate limiting, or recovery codes).
