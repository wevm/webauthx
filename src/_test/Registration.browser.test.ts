import { expect, test } from 'vitest'
import { Registration as Registration_client } from 'webauthx/client'
import { Registration as Registration_server, Aaguid } from 'webauthx/server'

import { rpId, rpName } from '../../test/constants.js'

test('default', async () => {
  // 1. Server generates serialized options
  const { challenge, options } = Registration_server.getOptions({
    name: 'alice',
    rp: { id: rpId, name: rpName },
  })

  // 2. Client creates credential from serialized options
  const credential = await Registration_client.create({ options })

  expect(credential.id).toBeTypeOf('string')
  expect(credential.id.length).toBeGreaterThan(0)
  expect(credential.publicKey).toBeDefined()

  // 3. Server verifies the serialized credential
  const result = Registration_server.verify(credential, {
    challenge,
    origin: 'http://localhost:63315',
    rpId,
  })

  expect(result.credential.id).toBe(credential.id)
  expect(result.credential.publicKey).toBeDefined()
  expect(result.counter).toBeTypeOf('number')
  expect(result.aaguid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  expect(Aaguid.extract(credential)).toBe(result.aaguid)
})

test('behavior: with user object', async () => {
  const { challenge, options } = Registration_server.getOptions({
    rp: { id: rpId, name: rpName },
    user: { name: 'bob', displayName: 'Bob' },
  })

  const credential = await Registration_client.create({ options })

  expect(credential.id).toBeTypeOf('string')

  const result = Registration_server.verify(credential, {
    challenge,
    origin: 'http://localhost:63315',
    rpId,
  })

  expect(result.credential.publicKey).toBeDefined()
})

test('aaguid: lookup', async () => {
  const fetchFn: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        '08987058-cadc-4b81-b6e1-30de50dcbe96': { name: 'Windows Hello' },
      }),
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
})
