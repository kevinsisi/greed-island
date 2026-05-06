export type Locale = 'zh' | 'en'

export const SUPPORTED_LOCALES: readonly Locale[] = ['zh', 'en']

export const LOCALE_LABEL: Readonly<Record<Locale, string>> = {
  zh: '繁體中文',
  en: 'English',
}

/**
 * Translation dictionary. Every UI string the frontend renders MUST
 * exist as a key here in both `zh` and `en`. Hard-coded copy in
 * components is forbidden — `frontend-design` and the
 * web-observation-frontend spec require all UI text to flow through
 * this layer.
 */
export type TranslationKey =
  // brand
  | 'brand.title'
  | 'brand.subtitle'
  // status bar
  | 'status.tick'
  | 'status.live'
  | 'status.idle'
  | 'status.fixture'
  | 'status.switchTo'
  | 'status.surface.mobile'
  | 'status.surface.desktop'
  // navigation
  | 'nav.dashboard'
  | 'nav.dashboard.desc'
  | 'nav.since'
  | 'nav.since.desc'
  | 'nav.map'
  | 'nav.map.desc'
  | 'nav.npcs'
  | 'nav.npcs.desc'
  | 'nav.events'
  | 'nav.events.desc'
  | 'nav.cards'
  | 'nav.cards.desc'
  // dashboard
  | 'dashboard.eyebrow'
  | 'dashboard.title'
  | 'dashboard.description'
  | 'dashboard.rareWindowOpen'
  | 'dashboard.stats.tick'
  | 'dashboard.stats.tick.hint'
  | 'dashboard.stats.events'
  | 'dashboard.stats.events.hint'
  | 'dashboard.stats.npcs'
  | 'dashboard.stats.npcs.hint'
  | 'dashboard.stats.cards'
  | 'dashboard.stats.cards.hint'
  | 'dashboard.stats.weather'
  | 'dashboard.stats.weather.hint'
  | 'dashboard.stats.season'
  | 'dashboard.stats.season.hint'
  | 'dashboard.stats.sinceLast'
  | 'dashboard.stats.sinceLast.hint'
  | 'dashboard.recent.heading'
  | 'dashboard.recent.viewAll'
  // since last visit
  | 'since.eyebrow'
  | 'since.title'
  | 'since.description'
  // map
  | 'map.eyebrow'
  | 'map.title'
  | 'map.description'
  | 'map.tilePrefix'
  | 'map.coordinates'
  | 'map.tileNpcs'
  | 'map.tileEmpty'
  | 'map.empty'
  // npcs
  | 'npcs.eyebrow'
  | 'npcs.title'
  | 'npcs.description'
  | 'npcs.relationship'
  | 'npcs.lastActed'
  | 'npcs.silence'
  | 'npcs.mood'
  | 'npcs.intent'
  | 'npcs.knownActions'
  // events
  | 'events.eyebrow'
  | 'events.title'
  | 'events.description'
  | 'events.live'
  | 'events.offline'
  | 'events.filter.all'
  | 'events.filter.cards'
  | 'events.filter.npc'
  | 'events.filter.world'
  | 'events.empty'
  | 'events.payload'
  | 'events.noNarration'
  // cards
  | 'cards.eyebrow'
  | 'cards.title'
  | 'cards.description'
  | 'cards.filter.all'
  | 'cards.filter.owned'
  | 'cards.filter.missing'
  | 'cards.detail.lore'
  | 'cards.detail.discoveredAt'
  | 'cards.detail.notDiscovered'
  | 'cards.detail.empty'
  // misc
  | 'time.justNow'
  | 'time.minutesAgo'
  | 'time.hoursAgo'
  | 'time.daysAgo'
  | 'time.tickUnit'
  | 'footer.tagline'
  | 'language.label'
  // account
  | 'nav.account'
  | 'account.eyebrow'
  | 'account.title'
  | 'account.description'
  | 'account.email'
  | 'account.password'
  | 'account.loginButton'
  | 'account.registerButton'
  | 'account.toggleToRegister'
  | 'account.toggleToLogin'
  | 'account.signedInAs'
  | 'account.logout'
  | 'account.errorGeneric'
  | 'status.signin'

export type Translations = Readonly<Record<TranslationKey, string>>

export type TranslationParams = Readonly<Record<string, string | number>>

export type Translator = (key: TranslationKey, params?: TranslationParams) => string
