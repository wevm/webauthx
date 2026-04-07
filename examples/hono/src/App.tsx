import { hc } from 'hono/client'
import { startTransition, useEffect, useEffectEvent, useState } from 'react'
import { Authentication, Registration } from 'webauthx/client'

import type { AppType } from './worker/index.ts'

const client = hc<AppType>(`${import.meta.env.BASE_URL}/`)

type Authenticator = {
  iconDark?: string
  iconLight?: string
  name: string
}

type Session = {
  aaguid: string | null
  authenticator: Authenticator | null
  credentialId: string
  publicKey: `0x${string}`
}

export default function App() {
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const { isRefreshing, refresh, session, setSession } = useSession()

  const isBusy = isPending || isRefreshing
  const canRegister = displayName.trim().length > 0 && !isBusy

  async function register() {
    setError(null)
    setIsPending(true)

    try {
      const registerOptionsResponse = await client.register.options.$post({
        json: { name: displayName.trim() },
      })
      if (!registerOptionsResponse.ok) {
        const errorText = await registerOptionsResponse.text()
        console.error('Registration error:', errorText)
        throw new Error(
          `Request failed with status ${registerOptionsResponse.status}: ${errorText}`,
        )
      }
      const { options } = await registerOptionsResponse.json()

      // TODO: Remove cast once `ox` excludes `signal` from serialized options.
      const credential = await Registration.create({ options: options as any })

      const RegistrationResponse = await client.register.$post({
        json: { credential },
      })
      if (!RegistrationResponse.ok) {
        const errorText = await RegistrationResponse.text()
        console.error('Registration error:', errorText)
        throw new Error(`Request failed with status ${RegistrationResponse.status}: ${errorText}`)
      }

      await refresh()
      setDisplayName('')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setError(errorMessage)
    } finally {
      setIsPending(false)
    }
  }

  async function login() {
    setError(null)
    setIsPending(true)

    try {
      const authenticateOptionsResponse = await client.authenticate.options.$post({
        json: {},
      })
      if (!authenticateOptionsResponse.ok) {
        const errorText = await authenticateOptionsResponse.text()
        console.error('Authentication error:', errorText)
        throw new Error(
          `Request failed with status ${authenticateOptionsResponse.status}: ${errorText}`,
        )
      }
      const { options } = await authenticateOptionsResponse.json()
      // TODO: Remove cast once `ox` excludes `signal` from serialized options.
      const response = await Authentication.sign({ options: options as any })

      await client.authenticate.$post({
        json: { response },
      })
      await refresh()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setError(errorMessage)
    } finally {
      setIsPending(false)
    }
  }

  async function logout() {
    setError(null)
    setIsPending(true)

    try {
      await client.logout.$post()
      startTransition(() => {
        setSession(null)
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setError(errorMessage)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="root">
      <h1>webauthx + Hono</h1>

      <div className="card">
        {session ? (
          <button className="logout" disabled={isBusy} onClick={() => void logout()} type="button">
            logout
          </button>
        ) : (
          <>
            <input
              disabled={isBusy}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="display name"
              value={displayName}
            />
            <div className="actions">
              <button disabled={!canRegister} onClick={() => void register()} type="button">
                register
              </button>
              <button disabled={isBusy} onClick={() => void login()} type="button">
                login
              </button>
            </div>
          </>
        )}
      </div>

      {error ? (
        <div className="card">
          <div className="label">Error</div>
          <div className="error">{error}</div>
        </div>
      ) : null}

      {session ? <PasskeyCard session={session} /> : null}

      <div className="card">
        <div className="label">Session</div>
        <button disabled={isRefreshing} onClick={() => void refresh()} type="button">
          {isRefreshing ? '…' : 'GET /me'}
        </button>
        {session ? (
          <pre className={isRefreshing ? 'flash' : ''}>{JSON.stringify(session, null, 2)}</pre>
        ) : (
          <pre className={isRefreshing ? 'flash' : ''}>{'null'}</pre>
        )}
      </div>
    </div>
  )
}

function PasskeyCard({ session }: { session: Session }) {
  const icon = session.authenticator?.iconLight ?? session.authenticator?.iconDark ?? null
  const name = session.authenticator?.name ?? 'Unknown authenticator'

  return (
    <div className="card">
      <div className="label">Current passkey</div>
      <div className="passkey">
        {icon ? (
          <img alt={`${name} icon`} className="passkey-icon" height="24" src={icon} width="24" />
        ) : (
          <div className="passkey-icon passkey-icon-fallback">PK</div>
        )}
        <div className="passkey-copy">
          <div className="passkey-title">{name}</div>
          <div className="passkey-meta">
            {session.aaguid ? `AAGUID ${session.aaguid}` : 'Authenticator unavailable'}
          </div>
        </div>
      </div>
      <Detail label="credential" value={session.credentialId} />
      <Detail label="public key" value={session.publicKey} />
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="details">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  )
}

function useSession() {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [session, setSession] = useState<Session | null>(null)

  const refresh = useEffectEvent(async () => {
    setIsRefreshing(true)

    try {
      const sessionResponse = await client.me.$get()
      if (!sessionResponse.ok) {
        const errorText = await sessionResponse.text()
        console.error('Session refresh error:', errorText)
        throw new Error(`Request failed with status ${sessionResponse.status}: ${errorText}`)
      }
      const session = await sessionResponse.json()

      startTransition(() => {
        setSession(session)
      })
    } finally {
      setIsRefreshing(false)
    }
  })

  useEffect(() => {
    void refresh()
  }, [])

  return {
    isRefreshing,
    refresh,
    session,
    setSession,
  }
}
