// /profile — every signed-in player can edit their own profile here.
// Covers nickname (display name), avatar preset, password rotation,
// and a mirrored language toggle so the option is reachable from
// inside the page rather than only from the brand bar.

import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { Avatar, AvatarPicker, AVATAR_PRESETS } from '../components/common/Avatar'
import { useAuth } from '../state/AuthContext'
import { useI18n, type Locale } from '../i18n'
import { api, ApiError } from '../api/client'

type Banner = { kind: 'success' | 'error'; message: string }

export function ProfilePage() {
  const { t, locale, setLocale, supportedLocales, localeLabel } = useI18n()
  const { account, token, applyAccount, logout } = useAuth()

  const [nickname, setNickname] = useState<string>('')
  const [avatar, setAvatar] = useState<string>('tide')
  const [presets, setPresets] = useState<readonly string[]>(AVATAR_PRESETS)
  const [profileBanner, setProfileBanner] = useState<Banner | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [passwordBanner, setPasswordBanner] = useState<Banner | null>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)

  useEffect(() => {
    if (account) {
      setNickname(account.nickname ?? '')
      setAvatar(account.avatar)
    }
  }, [account])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    api
      .profile(token)
      .then((res) => {
        if (cancelled) return
        setPresets(res.avatarPresets)
      })
      .catch(() => {
        // server preset fetch is just a hint; the local default still works
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (!token || !account) {
    return <Navigate to="/account" replace />
  }

  const onSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProfileBanner(null)
    setProfileSaving(true)
    try {
      const trimmed = nickname.trim()
      const res = await api.updateProfile(token, {
        nickname: trimmed.length > 0 ? trimmed : null,
        avatar,
      })
      applyAccount(res.account)
      setProfileBanner({ kind: 'success', message: t('profile.saved') })
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('profile.errorGeneric')
      setProfileBanner({ kind: 'error', message: msg })
    } finally {
      setProfileSaving(false)
    }
  }

  const onChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordBanner(null)
    if (newPassword.length < 8) {
      setPasswordBanner({ kind: 'error', message: t('profile.password.tooShort') })
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordBanner({ kind: 'error', message: t('profile.password.mismatch') })
      return
    }
    setPasswordSaving(true)
    try {
      await api.changePassword(token, currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirm('')
      setPasswordBanner({ kind: 'success', message: t('profile.password.saved') })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CURRENT_PASSWORD') {
        setPasswordBanner({ kind: 'error', message: t('profile.password.wrongCurrent') })
      } else if (err instanceof Error) {
        setPasswordBanner({ kind: 'error', message: err.message })
      } else {
        setPasswordBanner({ kind: 'error', message: t('profile.errorGeneric') })
      }
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('profile.eyebrow')}
        title={t('profile.title')}
        description={t('profile.description')}
      />

      <section className="gi-panel p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar avatar={account.avatar} size="lg" ringed />
          <div className="min-w-0">
            <div className="font-display font-extrabold text-lg text-ground-100 truncate">
              {account.displayName}
            </div>
            <div className="text-[12px] text-ground-400 truncate">{account.email}</div>
            <div className="mt-1 font-display text-[10px] uppercase tracking-tightest text-ember-400">
              {t(`admin.role.${account.role}`)}
            </div>
          </div>
        </div>
      </section>

      <form className="gi-panel p-5 flex flex-col gap-4" onSubmit={onSaveProfile}>
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('profile.identityHeading')}
        </h2>
        <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('profile.nickname')}
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={24}
            placeholder={t('profile.nicknamePlaceholder')}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none"
          />
          <span className="text-[10px] normal-case tracking-normal text-ground-500">
            {t('profile.nicknameHint')}
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-display uppercase tracking-tightest text-ground-400">
            {t('profile.avatarHeading')}
          </span>
          <AvatarPicker
            value={avatar}
            onChange={setAvatar}
            presets={presets}
            disabled={profileSaving}
          />
        </div>

        {profileBanner && (
          <div
            className={[
              'text-[12px] font-display uppercase tracking-tightest',
              profileBanner.kind === 'success' ? 'text-moss-400' : 'text-rust-400',
            ].join(' ')}
          >
            {profileBanner.message}
          </div>
        )}

        <button
          type="submit"
          disabled={profileSaving}
          className="gi-touch self-start px-4 text-[11px] font-display uppercase tracking-tightest text-ember-400 border border-ember-600 hover:bg-ember-500/10 transition-colors rounded-sharp disabled:opacity-60"
        >
          {profileSaving ? t('profile.saving') : t('profile.saveButton')}
        </button>
      </form>

      <form className="gi-panel p-5 flex flex-col gap-4" onSubmit={onChangePassword}>
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('profile.password.heading')}
        </h2>
        <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('profile.password.current')}
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('profile.password.new')}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-display uppercase tracking-tightest text-ground-400">
          {t('profile.password.confirm')}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none"
          />
        </label>

        {passwordBanner && (
          <div
            className={[
              'text-[12px] font-display uppercase tracking-tightest',
              passwordBanner.kind === 'success' ? 'text-moss-400' : 'text-rust-400',
            ].join(' ')}
          >
            {passwordBanner.message}
          </div>
        )}

        <button
          type="submit"
          disabled={passwordSaving}
          className="gi-touch self-start px-4 text-[11px] font-display uppercase tracking-tightest text-ember-400 border border-ember-600 hover:bg-ember-500/10 transition-colors rounded-sharp disabled:opacity-60"
        >
          {passwordSaving ? t('profile.saving') : t('profile.password.saveButton')}
        </button>
      </form>

      <section className="gi-panel p-5 flex flex-col gap-3">
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('profile.languageHeading')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {supportedLocales.map((loc: Locale) => (
            <button
              key={loc}
              type="button"
              onClick={() => setLocale(loc)}
              aria-pressed={loc === locale}
              className={[
                'gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border rounded-sharp transition-colors',
                loc === locale
                  ? 'border-ember-600 bg-ember-500/10 text-ember-400'
                  : 'border-ground-700 text-ground-300 hover:border-ember-600/60 hover:text-ground-100',
              ].join(' ')}
            >
              {localeLabel[loc]}
            </button>
          ))}
        </div>
      </section>

      <section className="gi-panel p-5 flex flex-col gap-3">
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('profile.sessionHeading')}
        </h2>
        <div className="text-sm text-ground-300">
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
