// /forgot-password — entry point for the password reset flow.
//
// Email delivery is not wired in for this deployment. The server
// returns the reset token in the JSON response so the player can
// copy the link from this page (or the admin can forward it).

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { useI18n } from '../i18n'
import { api } from '../api/client'

export function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetUrl, setResetUrl] = useState<string | null>(null)
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [genericMessage, setGenericMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setResetUrl(null)
    setIssuedToken(null)
    setGenericMessage(null)
    setCopied(false)
    try {
      const res = await api.forgotPassword(email.trim())
      if (res.issued && res.token) {
        const path = `/reset-password?token=${res.token}`
        const url =
          typeof window !== 'undefined'
            ? `${window.location.origin}${path}`
            : path
        setIssuedToken(res.token)
        setResetUrl(url)
      } else {
        setGenericMessage(t('forgot.successGeneric'))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('forgot.errorGeneric')
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const onCopy = async () => {
    if (!resetUrl) return
    try {
      await navigator.clipboard.writeText(resetUrl)
      setCopied(true)
    } catch {
      setCopied(false)
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

      {resetUrl && (
        <section className="gi-panel p-5 flex flex-col gap-3">
          <div className="text-sm text-moss-300">{t('forgot.successWithToken')}</div>
          <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
            {t('forgot.linkLabel')}
            <input
              type="text"
              readOnly
              value={resetUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 font-mono"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ember-400 border border-ember-600 hover:bg-ember-500/10 transition-colors rounded-sharp"
            >
              {copied ? t('forgot.copied') : t('forgot.copyLink')}
            </button>
            {issuedToken && (
              <Link
                to={`/reset-password?token=${issuedToken}`}
                className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ground-200 border border-ground-700 hover:border-ember-600/60 transition-colors rounded-sharp"
              >
                {t('reset.title')} →
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
