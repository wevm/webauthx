import { expect, test } from 'vitest'
import { Registration as Registration_client } from 'webauthx/client'
import { Registration as Registration_server } from 'webauthx/server'

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
