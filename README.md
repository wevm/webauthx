<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/wevm/webauthx/refs/heads/main/.github/banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/wevm/webauthx/refs/heads/main/.github/banner-light.svg">
  <img alt="webauthx" src="https://raw.githubusercontent.com/wevm/webauthx/refs/heads/main/.github/banner-light.svg" width="100%">
</picture>

<p align="center"><b>Tools for server ↔ client WebAuthn ceremony orchestration.</b></p>

<p align="center">
  <a href="#quickprompt">Quickprompt</a> · <a href="#install">Install</a> · <a href="#usage-walkthrough">Usage Walkthrough</a> · <a href="#api-reference">API Reference</a> · <a href="#license">License</a>
</p>

## Quickprompt

Prompt your agent:

```
Add passkey authentication to my app using curl.md/github.com/wevm/webauthx/SKILL.md, and add it to my skills.
```

## Install

```bash
npm i webauthx
```

```bash
pnpm i webauthx
```

```bash
bun i webauthx
```

## Usage Walkthrough

### Registration (Sign up)

Register a new passkey credential for a user. The server generates a challenge, the client creates the credential, and the server verifies it.

#### 1. Generate Options (Server)

```ts
import { Registration } from 'webauthx/server'

app.post('/register/options', async (request) => {
  const { name } = await request.json()

  // Generate a challenge and WebAuthn options for the client.
  const { challenge, options } = Registration.getOptions({
    name,
    rp: { id: 'example.com', name: 'Example' },
  })

  // Persist challenge for verification in the next step.
  await store.storeChallenge(challenge)

  // Send WebAuthn options to the client.
  return Response.json({ options })
})
```

#### 2. Create Credential (Client)

```ts
import { Registration } from 'webauthx/client'

// Fetch WebAuthn options from the server.
const { options } = await fetch('/register/options', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'alice' }),
}).then((r) => r.json())

// Prompt the user to create a passkey.
const credential = await Registration.create({ options })

// Send the credential to the server for verification.
await fetch('/register/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credential }),
})
```

#### 3. Verify Credential (Server)

```ts
import { Registration } from 'webauthx/server'

app.post('/register/verify', async (request) => {
  const { credential } = await request.json()

  // Consume the stored challenge (single-use).
  const challenge = await store.consumeChallenge(request)

  // Verify attestation & extract the public key.
  const result = Registration.verify(credential, {
    challenge,
    origin: 'https://example.com',
    rpId: 'example.com',
  })

  // Persist the credential for future authentication.
  await store.storeCredential(result.credential)
})
```

### Authentication (Log in)

Authenticate a returning user with their existing passkey. The server generates a challenge, the client signs it, and the server verifies the signature.

#### 1. Generate Options (Server)

```ts
import { Authentication } from 'webauthx/server'

app.post('/auth/options', async (request) => {
  const { credentialId } = await request.json()

  // Generate a challenge and WebAuthn options for the client.
  const { challenge, options } = Authentication.getOptions({
    credentialId,
    rpId: 'example.com',
  })

  // Persist challenge for verification in the next step.
  await store.storeChallenge(challenge)

  // Send WebAuthn options to the client.
  return Response.json({ options })
})
```

#### 2. Sign Challenge (Client)

```ts
import { Authentication } from 'webauthx/client'

// Fetch WebAuthn options from the server.
const { options } = await fetch('/auth/options', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credentialId }),
}).then((r) => r.json())

// Prompt the user to sign the challenge with their passkey.
const response = await Authentication.sign({ options })

// Send the response to the server for verification.
await fetch('/auth/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ response }),
})
```

#### 3. Verify Signature (Server)

```ts
import { Authentication } from 'webauthx/server'

app.post('/auth/verify', async (request) => {
  const { response } = await request.json()

  // Consume the stored challenge (single-use).
  const challenge = await store.consumeChallenge(request)

  // Look up the stored public key for this credential.
  const credential = await store.getCredential(response.id)

  // Verify the P-256 signature.
  const valid = Authentication.verify(response, {
    challenge,
    publicKey: credential.publicKey,
    origin: 'https://example.com',
    rpId: 'example.com',
  })
})
```

## API Reference

### `webauthx/client`

#### `Authentication.sign`

Signs a challenge via `navigator.credentials.get`. Accepts WebAuthn options from the server and returns a response ready to send back.

##### Usage

```ts
import { Authentication } from 'webauthx/client'

const response = await Authentication.sign({ options })
```

##### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `getFn` | `function` | Custom credential request function (for testing). |
| `options` | `CredentialRequestOptions` | WebAuthn options from `Authentication.getOptions`. |

##### Return Value

`Promise<Authentication.Response>` — the response to send to the server.

---

#### `Registration.create`

Creates a new WebAuthn credential via `navigator.credentials.create`. Accepts WebAuthn options from the server and returns a credential ready to send back.

##### Usage

```ts
import { Registration } from 'webauthx/client'

const credential = await Registration.create({ options })
```

##### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `createFn` | `function` | Custom credential creation function (for testing). |
| `options` | `CredentialCreationOptions` | WebAuthn options from `Registration.getOptions`. |

##### Return Value

`Promise<Registration.Credential>` — the credential to send to the server.

---

### `webauthx/server`

#### `Authentication.getOptions`

Generates `PublicKeyCredentialRequestOptions` for authentication. A random 32-byte challenge is generated if one isn't provided.

##### Usage

```ts
import { Authentication } from 'webauthx/server'

const { challenge, options } = Authentication.getOptions({
  credentialId: storedCredential.id,
  rpId: 'example.com',
})
```

##### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `challenge` | `Hex` | Optional challenge. A random 32-byte hex value is generated if omitted. |
| `credentialId` | `string \| string[]` | Credential ID(s) to allow. |
| `rpId` | `string` | Relying party ID. |
| `timeout` | `number` | Timeout in milliseconds. |
| `userVerification` | `string` | User verification requirement. |

##### Return Value

`{ challenge: Hex; options: CredentialRequestOptions }` — the hex challenge to store and the WebAuthn options to send to the client.

---

#### `Authentication.verify`

Verifies an authentication response from the client. Validates the rpIdHash, origin, challenge, and P-256 signature.

##### Usage

```ts
import { Authentication } from 'webauthx/server'

const valid = Authentication.verify(response, {
  challenge,
  publicKey: credential.publicKey,
  origin: 'https://example.com',
  rpId: 'example.com',
})
```

##### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `options.challenge` | `Hex` | Expected challenge. |
| `options.origin` | `string \| string[]` | Expected origin(s). |
| `options.publicKey` | `Hex` | The stored P-256 public key (hex). |
| `options.rpId` | `string` | Expected relying party ID. |
| `response` | `Authentication.Response` | The authentication response from the client. |

##### Return Value

`boolean` — `true` if the signature is valid.

---

#### `Registration.getOptions`

Generates `PublicKeyCredentialCreationOptions` for registration. A random 32-byte challenge is generated if one isn't provided.

##### Usage

```ts
import { Registration } from 'webauthx/server'

const { challenge, options } = Registration.getOptions({
  name: 'alice',
  rp: { id: 'example.com', name: 'Example' },
})
```

##### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `attestation` | `string` | Attestation conveyance preference. |
| `authenticatorSelection` | `object` | Authenticator selection criteria. |
| `challenge` | `Hex` | Optional challenge. A random 32-byte hex value is generated if omitted. |
| `excludeCredentialIds` | `string[]` | Credential IDs to exclude (prevent re-registration). |
| `name` | `string` | Display name for the credential (shorthand for `user.name`). |
| `rp` | `{ id: string; name: string }` | Relying party identifier and display name. |
| `timeout` | `number` | Timeout in milliseconds. |
| `user` | `{ name: string; displayName?: string; id?: BufferSource }` | User account descriptor. Alternative to `name`. |

##### Return Value

`{ challenge: Hex; options: CredentialCreationOptions }`

Challenge to store and the WebAuthn options to send to the client.

---

#### `Registration.verify`

Verifies a registration credential from the client. Validates the attestation, rpIdHash, challenge, and origin, and extracts the P-256 public key.

##### Usage

```ts
import { Registration } from 'webauthx/server'

const result = Registration.verify(credential, {
  challenge,
  origin: 'https://example.com',
  rpId: 'example.com',
})
```

##### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `credential` | `Registration.Credential` | The credential from the client. |
| `options.challenge` | `Hex \| Uint8Array \| ((challenge: string) => boolean)` | Expected challenge value or async validator function. |
| `options.origin` | `string \| string[]` | Expected origin(s) (e.g. `"https://example.com"`). |
| `options.rpId` | `string` | Relying party ID (e.g. `"example.com"`). |
| `options.userVerification` | `string` | User verification requirement. Default: `'required'`. |

##### Return Value

`Registration.Response`

## License

MIT
