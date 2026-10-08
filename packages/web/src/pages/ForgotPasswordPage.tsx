// /forgot-password — anonymous entry point for the recovery flow.
//
// This deployment has no email delivery. To avoid account enumeration, the
// public request never returns a reset token; players should contact an admin.

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { useI18n } from '../i18n'
import { api } from '../api/client'

export function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [genericMessage, setGenericMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setGenericMessage(null)
    try {
      await api.forgotPassword(email.trim())
      setGenericMessage(t('forgot.successGeneric'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('forgot.errorGeneric')
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('forgot.eyebrow')}
        title={t('forgot.title')}
        description={t('forgot.description')}
      />

      <form className="gi-panel p-5 flex flex-col gap-4 max-w-md" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('forgot.email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            {busy ? t('forgot.submitting') : t('forgot.submit')}
          </button>
          <Link
            to="/account"
            className="text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100"
          >
            {t('forgot.backToLogin')}
          </Link>
        </div>
      </form>

      {genericMessage && (
        <section className="gi-panel p-5 text-sm text-moss-300">{genericMessage}</section>
      )}
    </div>
  )
}
