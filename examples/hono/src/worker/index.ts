import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import type { CookieOptions } from 'hono/utils/cookie'
import { Authentication, Registration, Aaguid } from 'webauthx/server'
import { z } from 'zod'

type CredentialRecord = {
  aaguid?: string | undefined
  publicKey: `0x${string}`
}

const cookie = {
  challenge: {
    httpOnly: true,
    maxAge: 300,
    path: '/',
    sameSite: 'Lax',
    secure: true,
  },
  session: {
    httpOnly: true,
    maxAge: 86_400,
    path: '/',
    sameSite: 'Lax',
    secure: true,
  },
} satisfies Record<string, CookieOptions>

const auth = createMiddleware<{
  Bindings: Env
  Variables: { credential: CredentialRecord; credentialId: string }
}>(async (c, next) => {
  const credentialId = await getSignedCookie(c, c.env.SECRET_KEY, 'session')
  if (!credentialId) return c.json({ error: 'Not authenticated' }, 401)

  const publicKey = await c.env.AUTH_KV.get(`credential:${credentialId}`)
  if (!publicKey) return c.json({ error: 'Unknown credential' }, 401)
  c.set('credential', JSON.parse(publicKey))
  c.set('credentialId', credentialId)
  await next()
})

const app = new Hono<{ Bindings: Env }>()
  .post(
    '/register/options',
    zValidator('json', z.object({ name: z.string().min(1).max(64) })),
    async (c) => {
      const { name } = c.req.valid('json')

      const { challenge, options } = Registration.getOptions({
        name,
        rp: { id: c.env.RP_ID, name: 'webauthx Demo' },
      })

      await setSignedCookie(c, 'challenge', challenge, c.env.SECRET_KEY, cookie.challenge)

      return c.json({ options })
    },
  )
  .post(
    '/register',
    zValidator('json', z.object({ credential: z.custom<Registration.Credential>() })),
    async (c) => {
      const { credential } = c.req.valid('json')

      const challenge = (await getSignedCookie(c, c.env.SECRET_KEY, 'challenge')) as
        | `0x${string}`
        | false
      deleteCookie(c, 'challenge', { path: '/' })
      if (!challenge) return c.json({ error: 'Invalid or expired challenge' }, 400)

      const result = Registration.verify(credential, {
        challenge,
        origin: c.env.ORIGIN,
        rpId: c.env.RP_ID,
      })

      const record = {
        aaguid: result.aaguid,
        publicKey: result.credential.publicKey,
      } satisfies CredentialRecord
      await c.env.AUTH_KV.put(`credential:${result.credential.id}`, JSON.stringify(record))

      await setSignedCookie(c, 'session', result.credential.id, c.env.SECRET_KEY, cookie.session)

      return c.json({
        authenticator: result.aaguid ? await Aaguid.lookup({ id: result.aaguid }) : null,
        aaguid: result.aaguid ?? null,
        id: result.credential.id,
        publicKey: result.credential.publicKey,
      })
    },
  )
  .post(
    '/authenticate/options',
    zValidator('json', z.object({ credentialId: z.string().max(1024).optional() })),
    async (c) => {
      const { credentialId } = c.req.valid('json')

      const { challenge, options } = Authentication.getOptions({
        credentialId,
        rpId: c.env.RP_ID,
      })

      await setSignedCookie(c, 'challenge', challenge, c.env.SECRET_KEY, cookie.challenge)

      return c.json({ options })
    },
  )
  .post(
    '/authenticate',
    zValidator('json', z.object({ response: z.custom<Authentication.Response>() })),
    async (c) => {
      const { response } = c.req.valid('json')

      const challenge = (await getSignedCookie(c, c.env.SECRET_KEY, 'challenge')) as
        | `0x${string}`
        | false
      deleteCookie(c, 'challenge', { path: '/' })
      if (!challenge) return c.json({ error: 'Invalid or expired challenge' }, 400)

      const value = await c.env.AUTH_KV.get(`credential:${response.id}`)
      if (!value) return c.json({ error: 'Unknown credential' }, 400)

      const credential = JSON.parse(value) as CredentialRecord
      if (!credential) return c.json({ error: 'Unknown credential' }, 400)

      if (
        !Authentication.verify(response, {
          challenge,
          origin: c.env.ORIGIN,
          publicKey: credential.publicKey,
          rpId: c.env.RP_ID,
        })
      )
        return c.json({ error: 'Verification failed' }, 401)

      await setSignedCookie(c, 'session', response.id, c.env.SECRET_KEY, cookie.session)

      return c.json({ credentialId: response.id })
    },
  )
  .get('/me', auth, async (c) => {
    const aaguid = c.var.credential.aaguid ?? null
    return c.json({
      aaguid,
      authenticator: aaguid ? await Aaguid.lookup({ id: aaguid }) : null,
      credentialId: c.var.credentialId,
      publicKey: c.var.credential.publicKey,
    })
  })
  .post('/logout', auth, async (c) => {
    deleteCookie(c, 'session', { path: '/' })
    return c.json({ ok: true })
  })

export type AppType = typeof app

export default app satisfies ExportedHandler<Cloudflare.Env>
