import { Authentication, type Types } from 'ox/webauthn'

import type { OneOf } from '../internal/types.js'

/** Authentication response. */
export type Response = Authentication.Response<true>

/**
 * Signs a challenge via `navigator.credentials.get`.
 *
 * Accepts either serialized options (from the server) or pre-formed
 * options. Returns a serialized response ready to send back to the server.
 *
 * @example
 * ```ts
 * import { Authentication } from 'webauthx/client'
 *
 * // 1. Fetch serialized options from the server.
 * const options = await fetch('/auth/challenge').then((r) => r.json())
 *
 * // 2. Prompt the user to sign the challenge.
 * const response = await Authentication.sign({ options })
 *
 * // 3. Send the response back to the server for verification.
 * await fetch('/auth/verify', {
 *   method: 'POST',
 *   body: JSON.stringify(response),
 * })
 * ```
 */
export async function sign(options: sign.Options): Promise<Response> {
  const response = await (() => {
    if ('options' in options) {
      const deserialized = Authentication.deserializeOptions(options.options as never)
      return Authentication.sign({
        ...deserialized,
        getFn: options.getFn,
      } as Authentication.sign.Options)
    }
    return Authentication.sign(options)
  })()
  return Authentication.serializeResponse(response)
}

export declare namespace sign {
  type Options = OneOf<
    | Authentication.sign.Options
    | {
        /** Custom credential request function (for testing). */
        getFn?: Authentication.sign.Options['getFn'] | undefined
        /** Serialized options from the server. */
        options: Types.CredentialRequestOptions<true>
      }
  >

  type ErrorType =
    | Authentication.sign.ErrorType
    | Authentication.deserializeOptions.ErrorType
    | Authentication.serializeResponse.ErrorType
}
