import { Base64, Cbor, Hex } from 'ox'

import type { Credential } from './Registration.js'

const cache = new Map<string, Promise<Record<string, Aaguid.Info>>>()

/** Default remote registry. */
export const remoteList =
  'https://github.com/passkeydeveloper/passkey-authenticator-aaguids/raw/refs/heads/main/combined_aaguid.json'

/**
 * Extracts the AAGUID from a serialized registration credential.
 *
 * Returns `undefined` if the attestation object cannot be decoded.
 *
 * @example
 * ```ts
 * import { Aaguid } from 'webauthx/server'
 *
 * const aaguid = Aaguid.extract(credential)
 * ```
 */
export function extract(credential: Aaguid.extract['Options']): Aaguid.extract['ReturnType'] {
  try {
    const { authData } = Cbor.decode<{ authData: Uint8Array }>(
      Base64.toBytes(credential.attestationObject),
    )
    if (authData.length < 53) return undefined
    return format(authData.subarray(37, 53))
  } catch {
    return undefined
  }
}

/**
 * Looks up friendly authenticator metadata from a remote AAGUID registry.
 *
 * @example
 * ```ts
 * import { Aaguid } from 'webauthx/server'
 *
 * const info = await Aaguid.lookup({
 *   id: '08987058-cadc-4b81-b6e1-30de50dcbe96',
 * })
 * ```
 */
export async function lookup(
  options: Aaguid.lookup['Options'],
): Promise<Aaguid.lookup['ReturnType']> {
  const registry = await getRegistry(options)
  return registry[normalize(options.id)] ?? null
}

function format(bytes: Uint8Array): Aaguid.Aaguid {
  const hex = Hex.fromBytes(bytes).slice(2)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

export declare namespace Aaguid {
  export type Aaguid = string

  /** Authenticator metadata. */
  export type Info = {
    name: string
    iconLight?: string | undefined
    iconDark?: string | undefined
  }

  type extract = {
    Options: Credential
    ReturnType: Aaguid | undefined
    ErrorType: Base64.toBytes.ErrorType | Cbor.decode.ErrorType
  }

  type lookup = {
    Options: {
      cache?: boolean | undefined
      fetchFn?: typeof fetch | undefined
      id: Aaguid
      remoteList?: string | undefined
    }
    ReturnType: Info | null
    ErrorType: Error
  }
}

async function fetchRegistry(
  options: Pick<Aaguid.lookup['Options'], 'fetchFn' | 'remoteList'> = {},
): Promise<Record<string, Aaguid.Info>> {
  const fetchFn = options.fetchFn ?? globalThis.fetch
  if (!fetchFn) throw new Error('`fetch` is not available in this environment.')

  const response = await fetchFn(options.remoteList ?? remoteList)
  if (!response.ok)
    throw new Error(`Failed to fetch AAGUID registry: ${response.status} ${response.statusText}`)

  const json = (await response.json()) as Record<
    string,
    {
      name: string
      icon_dark?: string | undefined
      icon_light?: string | undefined
      iconDark?: string | undefined
      iconLight?: string | undefined
    }
  >

  const registry: Record<string, Aaguid.Info> = {}
  for (const [id, info] of Object.entries(json)) {
    registry[normalize(id)] = {
      name: info.name,
      ...(info.iconLight || info.icon_light
        ? { iconLight: info.iconLight ?? info.icon_light }
        : {}),
      ...(info.iconDark || info.icon_dark ? { iconDark: info.iconDark ?? info.icon_dark } : {}),
    }
  }
  return registry
}

async function getRegistry(
  options: Pick<Aaguid.lookup['Options'], 'cache' | 'fetchFn' | 'remoteList'>,
): Promise<Record<string, Aaguid.Info>> {
  const list = options.remoteList ?? remoteList
  if (options.cache === false) return fetchRegistry({ fetchFn: options.fetchFn, remoteList: list })

  const cached = cache.get(list)
  if (cached) return cached

  const registry = fetchRegistry({
    fetchFn: options.fetchFn,
    remoteList: list,
  }).catch((error) => {
    cache.delete(list)
    throw error
  })
  cache.set(list, registry)
  return registry
}

function normalize(aaguid: string): Aaguid.Aaguid {
  return aaguid.toLowerCase()
}
