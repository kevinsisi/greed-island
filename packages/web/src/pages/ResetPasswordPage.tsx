// /reset-password — consumes a reset token (from the URL or pasted by
// the player) and rotates the password. On success the user is signed
// in immediately.

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { useI18n } from '../i18n'
import { api, ApiError } from '../api/client'
import { useAuth } from '../state/AuthContext'

export function ResetPasswordPage() {
  const { t } = useI18n()
  const { applyAccount } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [token, setToken] = useState<string>(() => searchParams.get('token') ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const fromUrl = searchParams.get('token')
    if (fromUrl && fromUrl !== token) {
      setToken(fromUrl)
    }
    // intentional: only sync from URL on mount / param change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError(t('reset.passwordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('reset.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      const res = await api.resetPassword(token.trim(), password)
      applyAccount(res.account, res.token)
      setSuccess(true)
      // strip token from URL once consumed so the user does not share it
      // accidentally on a subsequent reload.
      const next = new URLSearchParams(searchParams)
      next.delete('token')
      setSearchParams(next, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_TOKEN') {
        setError(t('reset.tokenInvalid'))
      } else if (err instanceof ApiError && err.code === 'WEAK_PASSWORD') {
        setError(t('reset.passwordTooShort'))
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError(t('reset.errorGeneric'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow={t('reset.eyebrow')}
          title={t('reset.title')}
          description={t('reset.description')}
        />
        <section className="gi-panel p-5 flex flex-col gap-3">
          <div className="text-sm text-moss-300">{t('reset.success')}</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="gi-touch px-4 text-[11px] font-display uppercase tracking-tightest text-ember-400 border border-ember-600 hover:bg-ember-500/10 transition-colors rounded-sharp"
            >
              {t('reset.gotoApp')}
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('reset.eyebrow')}
        title={t('reset.title')}
        description={t('reset.description')}
      />

      <form className="gi-panel p-5 flex flex-col gap-4 max-w-md" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('reset.tokenLabel')}
          <input
            type="text"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 font-mono focus:border-ember-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('reset.newPassword')}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('reset.confirmPassword')}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none"
          />
        </label>

        {error && (
          <div className="text-[11px] font-display uppercase tracking-tightest text-rust-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="gi-touch px-4 text-[11px] font-display uppercase tracking-tightest text-ember-400 border border-ember-600 hover:bg-ember-500/10 transition-colors rounded-sharp disabled:opacity-60"
          >
            {busy ? t('reset.submitting') : t('reset.submit')}
          </button>
          <Link
            to="/account"
            className="text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100"
          >
            {t('reset.backToLogin')}
          </Link>
        </div>
      </form>
    </div>
  )
}
