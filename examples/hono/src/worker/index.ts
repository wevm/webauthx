import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import type { CookieOptions } from 'hono/utils/cookie'
import { Authentication, Registration } from 'webauthx/server'
import { z } from 'zod'

const app = new Hono<{ Bindings: Env }>()

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
  Variables: { credentialId: string; publicKey: string }
}>(async (c, next) => {
  const credentialId = await getSignedCookie(c, c.env.SECRET_KEY, 'session')
  if (!credentialId) return c.json({ error: 'Not authenticated' }, 401)
  const publicKey = await c.env.AUTH_KV.get(`credential:${credentialId}`)
  if (!publicKey) return c.json({ error: 'Unknown credential' }, 401)
  c.set('credentialId', credentialId)
  c.set('publicKey', publicKey)
  await next()
})

app.post(
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

app.post(
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

    await c.env.AUTH_KV.put(`credential:${result.credential.id}`, result.credential.publicKey)

    await setSignedCookie(c, 'session', result.credential.id, c.env.SECRET_KEY, cookie.session)

    return c.json({
      id: result.credential.id,
      publicKey: result.credential.publicKey,
    })
  },
)

app.post(
  '/authenticate/options',
  zValidator('json', z.object({ credentialId: z.string().max(1024).optional() })),
  async (c) => {
    const { credentialId } = c.req.valid('json')

    const { challenge, options } = Authentication.getOptions({
      ...(credentialId ? { credentialId } : {}),
      rpId: c.env.RP_ID,
    })

    await setSignedCookie(c, 'challenge', challenge, c.env.SECRET_KEY, cookie.challenge)

    return c.json({ options })
  },
)

app.post(
  '/authenticate',
  zValidator('json', z.object({ response: z.custom<Authentication.Response>() })),
  async (c) => {
    const { response } = c.req.valid('json')

    const challenge = (await getSignedCookie(c, c.env.SECRET_KEY, 'challenge')) as
      | `0x${string}`
      | false
    deleteCookie(c, 'challenge', { path: '/' })
    if (!challenge) return c.json({ error: 'Invalid or expired challenge' }, 400)

    const publicKey = await c.env.AUTH_KV.get(`credential:${response.id}`)
    if (!publicKey) return c.json({ error: 'Unknown credential' }, 400)

    if (
      !Authentication.verify(response, {
        challenge,
        origin: c.env.ORIGIN,
        publicKey,
        rpId: c.env.RP_ID,
      })
    )
      return c.json({ error: 'Verification failed' }, 401)

    await setSignedCookie(c, 'session', response.id, c.env.SECRET_KEY, cookie.session)

    return c.json({ credentialId: response.id })
  },
)

app.get('/me', auth, async (c) => {
  return c.json({ credentialId: c.var.credentialId, publicKey: c.var.publicKey })
})

app.post('/logout', auth, async (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true })
})

export default app
