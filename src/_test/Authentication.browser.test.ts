import { Hex, PublicKey, WebCryptoP256 } from 'ox'
import { expect, test } from 'vitest'
import {
  Authentication as Authentication_client,
  Registration as Registration_client,
} from 'webauthx/client'
import {
  Authentication as Authentication_server,
  Registration as Registration_server,
} from 'webauthx/server'

import { rpId, rpName } from '../../test/constants.js'

async function registerCredential() {
  const { challenge, options } = Registration_server.getOptions({
    name: 'alice',
    rp: { id: rpId, name: rpName },
  })
  const credential = await Registration_client.create({ options })
  const result = Registration_server.verify(credential, {
    challenge,
    origin: 'http://localhost:63315',
    rpId,
  })
  return { credential, result }
}

test('default', async () => {
  // 1. Register a credential first
  const { credential, result } = await registerCredential()

  // 2. Server generates authentication options
  const { challenge, options } = Authentication_server.getOptions({
    credentialId: credential.id,
    rpId,
  })

  // 3. Client signs the challenge
  const response = await Authentication_client.sign({ options })

  expect(response.metadata).toBeDefined()
  expect(response.metadata.authenticatorData).toBeTypeOf('string')
  expect(response.metadata.clientDataJSON).toBeTypeOf('string')
  expect(response.signature).toBeTypeOf('string')

  // 4. Server verifies the signature
  const valid = Authentication_server.verify(response, {
    challenge,
    origin: 'http://localhost:63315',
    publicKey: result.credential.publicKey,
    rpId,
  })

  expect(valid).toBe(true)
})

test('behavior: verification fails with wrong challenge', async () => {
  const { credential, result } = await registerCredential()

  const { options } = Authentication_server.getOptions({
    credentialId: credential.id,
    rpId,
  })

  const response = await Authentication_client.sign({ options })

  const wrongChallenge = Hex.random(32)
  const valid = Authentication_server.verify(response, {
    challenge: wrongChallenge,
    origin: 'http://localhost:63315',
    publicKey: result.credential.publicKey,
    rpId,
  })

  expect(valid).toBe(false)
})

test('behavior: verification fails with wrong public key', async () => {
  const { credential } = await registerCredential()
  const wrongKeyPair = await WebCryptoP256.createKeyPair()

  const { challenge, options } = Authentication_server.getOptions({
    credentialId: credential.id,
    rpId,
  })

  const response = await Authentication_client.sign({ options })

  const valid = Authentication_server.verify(response, {
    challenge,
    origin: 'http://localhost:63315',
    publicKey: PublicKey.toHex(wrongKeyPair.publicKey),
    rpId,
  })

  expect(valid).toBe(false)
})
