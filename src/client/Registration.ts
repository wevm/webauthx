import { Credential as Credential_, Registration, type Types } from 'ox/webauthn'

import type { OneOf } from '../internal/types.js'

/** Serialized credential. */
export type Credential = Credential_.Credential<true>

/**
 * Creates a new WebAuthn credential via `navigator.credentials.create`.
 *
 * Accepts either serialized options (from the server) or pre-formed
 * `Registration.create.Options`. Returns a serialized response ready
 * to send back to the server.
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
  return Credential_.serialize(credential)
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
