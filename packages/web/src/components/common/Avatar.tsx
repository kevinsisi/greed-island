// Avatar — renders a player's chosen preset using a glyph + tinted
// background. Avatars are stored as string IDs on the server; the
// frontend maps each ID to a glyph and a Tailwind color set.
//
// Adding a new preset: add an entry to AVATAR_STYLES, add the same
// string to AVATAR_PRESETS in the server (accounts.ts), and add a
// translation key under `profile.avatar.<id>` in zh.ts / en.ts.

import { useI18n, type TranslationKey } from '../../i18n'

export const AVATAR_PRESETS: readonly string[] = [
  'tide',
  'fox',
  'lantern',
  'sword',
  'leaf',
  'moon',
  'flame',
  'mask',
]

const AVATAR_STYLES: Readonly<
  Record<
    string,
    Readonly<{
      glyph: string
      bg: string
      ring: string
      fg: string
      labelKey: TranslationKey
    }>
  >
> = {
  tide: {
    glyph: '◈',
    bg: 'bg-ember-500/15',
    ring: 'ring-ember-600/40',
    fg: 'text-ember-300',
    labelKey: 'profile.avatar.tide',
  },
  fox: {
    glyph: '◐',
    bg: 'bg-rust-500/15',
    ring: 'ring-rust-600/40',
    fg: 'text-rust-300',
    labelKey: 'profile.avatar.fox',
  },
  lantern: {
    glyph: '✶',
    bg: 'bg-ember-400/15',
    ring: 'ring-ember-500/40',
    fg: 'text-ember-200',
    labelKey: 'profile.avatar.lantern',
  },
  sword: {
    glyph: '⚔',
    bg: 'bg-ground-700/40',
    ring: 'ring-ground-500/40',
    fg: 'text-ground-100',
    labelKey: 'profile.avatar.sword',
  },
  leaf: {
    glyph: '☘',
    bg: 'bg-moss-500/15',
    ring: 'ring-moss-600/40',
    fg: 'text-moss-300',
    labelKey: 'profile.avatar.leaf',
  },
  moon: {
    glyph: '☾',
    bg: 'bg-ground-800',
    ring: 'ring-ground-600/40',
    fg: 'text-ground-200',
    labelKey: 'profile.avatar.moon',
  },
  flame: {
    glyph: '▲',
    bg: 'bg-ember-600/20',
    ring: 'ring-ember-500/50',
    fg: 'text-ember-200',
    labelKey: 'profile.avatar.flame',
  },
  mask: {
    glyph: '☍',
    bg: 'bg-rust-700/20',
    ring: 'ring-rust-500/40',
    fg: 'text-rust-200',
    labelKey: 'profile.avatar.mask',
  },
}

function styleFor(id: string | null | undefined) {
  if (id) {
    const explicit = AVATAR_STYLES[id]
    if (explicit) return explicit
  }
  // Fallback. AVATAR_STYLES.tide is statically declared so this lookup
  // is always defined; the non-null assertion satisfies TS strict mode.
  return AVATAR_STYLES.tide!
}

export function avatarLabelKey(id: string | null | undefined): TranslationKey {
  return styleFor(id).labelKey
}

const SIZE_CLASS: Readonly<Record<'sm' | 'md' | 'lg', string>> = {
  sm: 'h-8 w-8 text-base',
  md: 'h-12 w-12 text-xl',
  lg: 'h-20 w-20 text-3xl',
}

interface AvatarProps {
  avatar: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  ringed?: boolean
  className?: string
}

export function Avatar({ avatar, size = 'md', ringed = false, className }: AvatarProps) {
  const style = styleFor(avatar)
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-flex items-center justify-center rounded-full',
        SIZE_CLASS[size],
        style.bg,
        style.fg,
        ringed ? `ring-2 ${style.ring}` : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="font-display leading-none">{style.glyph}</span>
    </span>
  )
}

interface AvatarPickerProps {
  value: string
  onChange: (next: string) => void
  presets?: readonly string[]
  disabled?: boolean
}

export function AvatarPicker({ value, onChange, presets, disabled }: AvatarPickerProps) {
  const { t } = useI18n()
  const options = presets ?? AVATAR_PRESETS
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {options.map((id) => {
        const style = styleFor(id)
        const selected = value === id
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(id)}
            aria-pressed={selected}
            aria-label={t(style.labelKey)}
            title={t(style.labelKey)}
            className={[
              'gi-touch flex flex-col items-center justify-center gap-1 rounded-sharp border p-2 transition-colors',
              selected
                ? 'border-ember-600 bg-ember-500/10'
                : 'border-ground-700 hover:border-ember-600/60 bg-ground-900',
              disabled ? 'opacity-50' : '',
            ].join(' ')}
          >
            <Avatar avatar={id} size="md" ringed={selected} />
            <span className="font-display text-[10px] uppercase tracking-tightest text-ground-300">
              {t(style.labelKey)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
