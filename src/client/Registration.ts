import { Credential as Credential_, Registration, type Types } from 'ox/webauthn'

import type { OneOf } from '../internal/types.js'

/** Serialized credential with optional transport hints. */
export type Credential = Credential_.Credential<true> & {
  transports?: Types.AuthenticatorTransport[] | undefined
}

/**
 * Creates a new WebAuthn credential via `navigator.credentials.create`.
 *
 * Accepts either serialized options (from the server) or pre-formed
 * `Registration.create.Options`. Returns a serialized response ready
 * to send back to the server.
 *
 * The returned credential includes a `transports` array (when available)
 * that should be persisted alongside the credential. These transport hints
 * help browsers and credential managers (like 1Password) locate the correct
 * authenticator during future authentication ceremonies.
 *
 * @example
 * ```ts
 * import { Registration } from 'webauthx/client'
 *
 * // 1. Fetch serialized options from the server.
 * const options = await fetch('/register/challenge').then((r) => r.json())
 *
 * // 2. Prompt the user to create a credential.
 * const credential = await Registration.create({ options })
 *
 * // 3. Send the credential back to the server for verification.
 * //    The `transports` field should also be persisted for future auth.
 * await fetch('/register/verify', {
 *   method: 'POST',
 *   body: JSON.stringify(credential),
 * })
 * ```
 */
export async function create(options: create.Options): Promise<Credential> {
  const createOptions = (() => {
    if ('options' in options) {
      const deserialized = Registration.deserializeOptions(options.options as never)
      return {
        ...deserialized,
        ...(options.createFn ? { createFn: options.createFn } : {}),
      } as never
    }
    return options
  })()
  const credential = await Registration.create(createOptions)
  const serialized = Credential_.serialize(credential)

  // Extract transports from the raw AuthenticatorAttestationResponse.
  // This tells us which transports the authenticator supports (e.g.
  // 'internal', 'hybrid', 'usb') so they can be stored and replayed
  // in future authentication ceremonies via allowCredentials.transports.
  const response = credential.raw
    .response as AuthenticatorAttestationResponse
  const transports =
    typeof response.getTransports === 'function'
      ? (response.getTransports() as Types.AuthenticatorTransport[])
      : undefined

  return {
    ...serialized,
    ...(transports && transports.length > 0 ? { transports } : {}),
  }
}

export declare namespace create {
  type Options = OneOf<
    | Registration.create.Options
    | {
        /** Custom credential creation function (for testing). */
        createFn?: Registration.create.Options['createFn'] | undefined
        /** Serialized options from the server. */
        options: Types.CredentialCreationOptions<true>
      }
  >

  type ErrorType =
    | Registration.create.ErrorType
    | Registration.deserializeOptions.ErrorType
    | Credential_.serialize.ErrorType
}

/** @internal */
interface AuthenticatorAttestationResponse {
  getTransports?: () => string[]
}
