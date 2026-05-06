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
  // atmosphere bar (replaces dashboard top bar)
  | 'atmos.tick'
  | 'atmos.weather'
  | 'atmos.season'
  | 'atmos.live'
  | 'atmos.idle'
  | 'atmos.fixture'
  | 'atmos.rareWindow'
  | 'atmos.rareWindowClosesIn'
  // navigation (game-mode)
  | 'nav.hub'
  | 'nav.codex'
  | 'nav.timeline'
  | 'nav.account'
  // hub (city map of areas)
  | 'hub.eyebrow'
  | 'hub.title'
  | 'hub.description'
  | 'hub.enter'
  | 'hub.npcCount'
  | 'hub.empty'
  // area
  | 'area.eyebrow'
  | 'area.back'
  | 'area.scene'
  | 'area.npcs'
  | 'area.npcsEmpty'
  | 'area.events'
  | 'area.eventsEmpty'
  | 'area.tilePrefix'
  // npc dialog
  | 'npc.dialogTitle'
  | 'npc.dialogClose'
  | 'npc.relationship'
  | 'npc.lastActed'
  | 'npc.lastActedNever'
  | 'npc.lineFallback'
  | 'npc.responseLogin'
  | 'npc.responsePrompt'
  | 'npc.responseGreet'
  | 'npc.responseAsk'
  | 'npc.responseTrade'
  | 'npc.responseLeave'
  | 'npc.responseLockedHint'
  | 'npc.intentGreet'
  | 'npc.intentAsk'
  | 'npc.intentTrade'
  | 'npc.intentLeave'
  | 'npc.tier.low'
  | 'npc.tier.mid'
  | 'npc.tier.high'
  | 'npc.trustDeltaUp'
  | 'npc.trustDeltaDown'
  | 'npc.trustUnchanged'
  | 'npc.dialogLeftHint'
  | 'npc.dialogContinueHint'
  | 'npc.errorRetry'
  | 'npc.errorMessage'
  | 'npc.privateNotice'
  | 'npc.history.heading'
  | 'npc.history.empty'
  | 'npc.history.loading'
  | 'npc.history.toggleShow'
  | 'npc.history.toggleHide'
  // codex
  | 'codex.eyebrow'
  | 'codex.title'
  | 'codex.description'
  | 'codex.sequencingSlots'
  | 'codex.sequencingSlotsHint'
  | 'codex.carrySlots'
  | 'codex.carrySlotsHint'
  | 'codex.slotEmpty'
  | 'codex.catalog'
  | 'codex.catalogHint'
  | 'codex.filter.all'
  | 'codex.filter.owned'
  | 'codex.filter.missing'
  | 'codex.detail.lore'
  | 'codex.detail.discoveredAt'
  | 'codex.detail.notDiscovered'
  | 'codex.detail.empty'
  | 'codex.loginGate'
  // timeline (replaces events page)
  | 'timeline.eyebrow'
  | 'timeline.title'
  | 'timeline.description'
  | 'timeline.live'
  | 'timeline.offline'
  | 'timeline.filter.all'
  | 'timeline.filter.cards'
  | 'timeline.filter.npc'
  | 'timeline.filter.world'
  | 'timeline.empty'
  | 'timeline.payload'
  | 'timeline.noNarration'
  // event ticker
  | 'ticker.heading'
  | 'ticker.empty'
  | 'ticker.collapse'
  | 'ticker.expand'
  // account
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
  | 'account.signin'
  // generic time
  | 'time.justNow'
  | 'time.minutesAgo'
  | 'time.hoursAgo'
  | 'time.daysAgo'
  | 'time.tickUnit'
  // misc
  | 'footer.tagline'
  | 'language.label'

export type Translations = Readonly<Record<TranslationKey, string>>

export type TranslationParams = Readonly<Record<string, string | number>>

export type Translator = (key: TranslationKey, params?: TranslationParams) => string
