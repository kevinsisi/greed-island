import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en } from './en'
import { zh } from './zh'
import {
  LOCALE_LABEL,
  SUPPORTED_LOCALES,
  type Locale,
  type TranslationKey,
  type TranslationParams,
  type Translations,
  type Translator,
} from './types'

const DICTIONARIES: Readonly<Record<Locale, Translations>> = { zh, en }

const STORAGE_KEY = 'gi.locale'
const DEFAULT_LOCALE: Locale = 'zh'

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return SUPPORTED_LOCALES.includes(stored as Locale) ? (stored as Locale) : DEFAULT_LOCALE
}

function format(template: string, params?: TranslationParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key as keyof TranslationParams]
    return value === undefined ? `{${key}}` : String(value)
  })
}

interface I18nValue {
  locale: Locale
  setLocale: (next: Locale) => void
  t: Translator
  supportedLocales: readonly Locale[]
  localeLabel: Readonly<Record<Locale, string>>
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale())

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zh' ? 'zh-Hant' : 'en'
    }
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
    setLocaleState(next)
  }, [])

  const t = useCallback<Translator>(
    (key: TranslationKey, params?: TranslationParams) => {
      const dict = DICTIONARIES[locale]
      const template = dict[key] ?? key
      return format(template, params)
    },
    [locale]
  )

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t,
      supportedLocales: SUPPORTED_LOCALES,
      localeLabel: LOCALE_LABEL,
    }),
    [locale, setLocale, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n must be used inside <I18nProvider>')
  }
  return value
}

export function useT(): Translator {
  return useI18n().t
}

export type { Locale, TranslationKey, TranslationParams, Translator } from './types'
