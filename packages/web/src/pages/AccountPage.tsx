import { useState, type FormEvent } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { useAuth } from '../state/AuthContext'
import { useI18n } from '../i18n'

export function AccountPage() {
  const { account, login, register, logout, loading, error } = useAuth()
  const { t } = useI18n()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  if (account) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow={t('account.eyebrow')}
          title={t('account.title')}
          description={t('account.description')}
        />
        <section className="gi-panel p-5 flex flex-col gap-4">
          <div className="text-sm text-ground-200">
            {t('account.signedInAs', { email: account.email })}
          </div>
          <button
            type="button"
            onClick={logout}
            className="gi-touch self-start px-4 text-[11px] font-display uppercase tracking-tightest border border-rust-600 text-rust-400 hover:bg-rust-500/10 transition-colors rounded-sharp"
          >
            {t('account.logout')}
          </button>
        </section>
      </div>
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else {
        await register(email.trim(), password)
      }
      setEmail('')
      setPassword('')
    } catch {
      // error is surfaced via auth context; nothing more to do
    }
  }

  const displayError = submitError ?? error

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('account.eyebrow')}
        title={t('account.title')}
        description={t('account.description')}
      />
      <form className="gi-panel p-5 flex flex-col gap-4 max-w-md" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('account.email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('account.password')}
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none"
          />
        </label>
        {displayError && (
          <div className="text-[11px] font-display uppercase tracking-tightest text-rust-400">
            {displayError}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="gi-touch px-4 text-[11px] font-display uppercase tracking-tightest text-ember-400 border border-ember-600 hover:bg-ember-500/10 transition-colors rounded-sharp disabled:opacity-60"
          >
            {mode === 'login' ? t('account.loginButton') : t('account.registerButton')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSubmitError(null)
              setMode((m) => (m === 'login' ? 'register' : 'login'))
            }}
            className="text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100 transition-colors"
          >
            {mode === 'login' ? t('account.toggleToRegister') : t('account.toggleToLogin')}
          </button>
        </div>
      </form>
    </div>
  )
}
