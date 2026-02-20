import { useState } from 'react'
import { Authentication, Registration } from 'webauthx/client'

export default function App() {
  const [name, setName] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [me, setMe] = useState<unknown>(null)
  const [meLoading, setMeLoading] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchMe = async () => {
    try {
      setMeLoading(true)
      const [res] = await Promise.all([fetch('/me'), new Promise((r) => setTimeout(r, 200))])
      setMe(await res.json())
    } finally {
      setMeLoading(false)
    }
  }

  async function register() {
    try {
      setLoading(true)
      const { options } = await fetch('/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then((r) => r.json())

      const credential = await Registration.create({ options })

      await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      }).then((r) => r.json())

      setLoggedIn(true)
    } finally {
      setLoading(false)
    }
  }

  async function login() {
    try {
      setLoading(true)

      const { options } = await fetch('/authenticate/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then((r) => r.json())

      const response = await Authentication.sign({ options })

      const res = await fetch('/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      setLoggedIn(true)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await fetch('/logout', { method: 'POST' })
    setLoggedIn(false)
    setMe(null)
  }

  return (
    <div className="root">
      <h1>webauthx + Hono</h1>

      <div className="card">
        {loggedIn ? (
          <button onClick={logout}>logout</button>
        ) : (
          <>
            <input
              disabled={loading}
              onChange={(e) => setName(e.target.value)}
              placeholder="username"
              value={name}
            />
            <button disabled={loading || !name} onClick={register}>
              register
            </button>
            <hr className="divider" />
            <button disabled={loading} onClick={login}>
              login
            </button>
          </>
        )}
      </div>

      <div className="card">
        <div className="label">Test authenticated route</div>
        <button disabled={meLoading} onClick={fetchMe}>
          {meLoading ? '…' : 'GET /me'}
        </button>
        {me ? <pre className={meLoading ? 'flash' : ''}>{JSON.stringify(me, null, 2)}</pre> : null}
      </div>
    </div>
  )
}
