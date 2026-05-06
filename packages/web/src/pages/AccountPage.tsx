import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { Avatar } from '../components/common/Avatar'
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
          <div className="flex items-center gap-4">
            <Avatar avatar={account.avatar} size="lg" ringed />
            <div className="min-w-0 flex-1">
              <div className="font-display font-extrabold text-lg text-ground-100 truncate">
                {account.displayName}
              </div>
              <div className="text-[12px] text-ground-400 truncate">{account.email}</div>
              <div className="mt-1 font-display text-[10px] uppercase tracking-tightest text-ember-400">
                {t(`admin.role.${account.role}`)}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/profile"
              className="gi-touch px-4 text-[11px] font-display uppercase tracking-tightest text-ember-400 border border-ember-600 hover:bg-ember-500/10 transition-colors rounded-sharp"
            >
              {t('nav.profile')}
            </Link>
            {account.role === 'admin' && (
              <Link
                to="/admin"
                className="gi-touch px-4 text-[11px] font-display uppercase tracking-tightest text-ground-200 border border-ground-700 hover:border-ember-600/60 transition-colors rounded-sharp"
              >
                {t('nav.admin')}
              </Link>
            )}
            {(account.role === 'gm' || account.role === 'admin') && (
              <Link
                to="/settings"
                className="gi-touch px-4 text-[11px] font-display uppercase tracking-tightest text-ground-200 border border-ground-700 hover:border-ember-600/60 transition-colors rounded-sharp"
              >
                {t('nav.settings')}
              </Link>
            )}
            <button
              type="button"
              onClick={logout}
              className="gi-touch px-4 text-[11px] font-display uppercase tracking-tightest border border-rust-600 text-rust-400 hover:bg-rust-500/10 transition-colors rounded-sharp"
            >
              {t('account.logout')}
            </button>
          </div>
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
          {mode === 'register' && (
            <span className="text-[10px] normal-case tracking-normal text-ground-500">
              {t('account.emailHint')}
            </span>
          )}
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
        <div className="flex flex-wrap items-center gap-3">
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
          {mode === 'login' && (
            <Link
              to="/forgot-password"
              className="ml-auto text-[11px] font-display uppercase tracking-tightest text-ember-400 hover:text-ember-300 transition-colors"
            >
              {t('account.forgotPassword')}
            </Link>
          )}
        </div>
      </form>
    </div>
  )
}
