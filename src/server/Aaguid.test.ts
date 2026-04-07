import { Base64, Hex, P256, PublicKey } from 'ox'
import { Authenticator } from 'ox/webauthn'
import { expect, test } from 'vitest'
import { Registration, Aaguid } from 'webauthx/server'

test('extracts aaguid from verified registration credentials', () => {
  const challenge = Hex.random(32)
  const credentialId = Uint8Array.from([1, 2, 3, 4])
  const clientDataJSON = Authenticator.getClientDataJSON({
    challenge,
    origin: 'https://example.com',
    type: 'webauthn.create',
  })
  const { publicKey } = P256.createKeyPair()
  const authData = Authenticator.getAuthenticatorData({
    credential: { id: credentialId, publicKey },
    flag: 0x45,
    rpId: 'example.com',
  })
  const attestationObject = Authenticator.getAttestationObject({ authData })
  const id = Base64.fromBytes(credentialId, { pad: false, url: true })
  const response = {
    attestationObject: Base64.fromHex(attestationObject, { pad: false, url: true }),
    clientDataJSON: Base64.fromBytes(new TextEncoder().encode(clientDataJSON), {
      pad: false,
      url: true,
    }),
    id,
    publicKey: PublicKey.toHex(publicKey),
    raw: {
      authenticatorAttachment: null,
      id,
      rawId: id,
      response: {
        attestationObject: Base64.fromHex(attestationObject, {
          pad: false,
          url: true,
        }),
        clientDataJSON: Base64.fromBytes(new TextEncoder().encode(clientDataJSON), {
          pad: false,
          url: true,
        }),
      },
      type: 'public-key',
    } as never,
  } satisfies Registration.Credential

  const result = Registration.verify(response, {
    challenge,
    origin: 'https://example.com',
    rpId: 'example.com',
  })

  expect(result.aaguid).toBe('00000000-0000-0000-0000-000000000000')
  expect(Aaguid.extract(response)).toBe(result.aaguid)
})

test('looks up authenticator metadata by normalized aaguid', async () => {
  let calls = 0
  const fetchFn: typeof fetch = async () => (
    (calls += 1),
    new Response(
      JSON.stringify({
        '08987058-cadc-4b81-b6e1-30de50dcbe96': { name: 'Windows Hello' },
      }),
    )
  )

  await expect(
    Aaguid.lookup({
      fetchFn,
      id: '08987058-CADC-4B81-B6E1-30DE50DCBE96',
      remoteList: 'https://example.com/aaguid.json',
    }),
  ).resolves.toMatchObject({
    name: 'Windows Hello',
  })
  await expect(
    Aaguid.lookup({
      fetchFn,
      id: '00000000-0000-0000-0000-000000000000',
      remoteList: 'https://example.com/aaguid.json',
    }),
  ).resolves.toBeNull()
  await expect(
    Aaguid.lookup({
      fetchFn,
      id: '08987058-cadc-4b81-b6e1-30DE50DCBE96',
      remoteList: 'https://example.com/aaguid.json',
    }),
  ).resolves.toMatchObject({
    name: 'Windows Hello',
  })
  expect(calls).toBe(1)
})
