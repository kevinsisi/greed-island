import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { useAuth } from '../../state/AuthContext'
import type { NpcSummary } from '../../state/types'

const SCRIPTED_LINES_ZH: Record<string, string[]> = {
  'port.merchant.anton': [
    '「風行的腳步從來不只是船的事。要看貨嗎？」',
    '「碼頭最近多了一些奇怪的訂單，你聽說了嗎？」',
    '「你來得正好——我這裡有一張紋卡需要識者。」'
  ],
  'forest.hunter.lyra': [
    '「噓——別出聲。北方的鹿群今晚會走那條死路。」',
    '「你身上有森林沒見過的氣味。」',
    '「想跟我交易一張，還是兩張紋卡？」'
  ],
  'temple.cleric.sela': [
    '「湖會選人。它選了你嗎？」',
    '「典開不是力量，是責任。記住這一點。」',
    '「你踏進來的時候，鈴自己響了一下。」'
  ]
}

const SCRIPTED_LINES_EN: Record<string, string[]> = {
  'port.merchant.anton': [
    '"Wind-walking is never just about ships. Care to see the wares?"',
    '"There have been odd orders coming through the docks lately. Heard about them?"',
    '"You arrived just in time — I have a rune card here that needs a reader."'
  ],
  'forest.hunter.lyra': [
    '"Quiet — the northern deer take the dead trail tonight."',
    '"You carry a scent the forest does not recognise."',
    '"Want to trade for one card — or two?"'
  ],
  'temple.cleric.sela': [
    '"The lake chooses. Did it choose you?"',
    '"Unsealing is not power. It is responsibility. Remember that."',
    '"The bell rang on its own when you stepped in."'
  ]
}

const FALLBACK_LINES_ZH = [
  '「……你想做什麼？」',
  '「世界一直在變，我也是。」',
  '「待久一點吧，我等等再開口。」'
]

const FALLBACK_LINES_EN = [
  '"...What is it you want?"',
  '"The world keeps shifting. So do I."',
  '"Stay a moment. I might speak again later."'
]

interface NpcDialogProps {
  npc: NpcSummary | null
  onClose: () => void
}

export function NpcDialog({ npc, onClose }: NpcDialogProps) {
  const { t, locale } = useI18n()
  const { account } = useAuth()
  const [responseAck, setResponseAck] = useState(false)

  useEffect(() => {
    if (!npc) return
    setResponseAck(false)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [npc, onClose])

  if (!npc) return null

  const linesByLocale = locale === 'zh' ? SCRIPTED_LINES_ZH : SCRIPTED_LINES_EN
  const fallback = locale === 'zh' ? FALLBACK_LINES_ZH : FALLBACK_LINES_EN
  const scripted = linesByLocale[npc.id] ?? fallback
  const lineIndex = npc.lastActedTick % scripted.length
  const line = scripted[lineIndex] ?? scripted[0] ?? t('npc.lineFallback', { name: npc.name })

  const handleRespond = () => {
    setResponseAck(true)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('npc.dialogTitle', { name: npc.name })}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ground-900/80 backdrop-blur-sm px-3 pb-3 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xl gi-panel border-ember-700/60 p-5 sm:p-6 flex flex-col gap-4"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
              {npc.role}
            </div>
            <h2 className="font-display font-extrabold text-2xl tracking-tightest text-ground-100">
              {npc.name}
            </h2>
            <div className="mt-1 text-[11px] font-display uppercase tracking-tightest text-ground-500">
              <span>{t('npc.relationship')} {npc.relationshipScore}</span>
              <span className="mx-2 text-ground-700">·</span>
              {npc.lastActedTick > 0
                ? <span>{t('npc.lastActed', { tick: npc.lastActedTick })}</span>
                : <span>{t('npc.lastActedNever')}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gi-touch shrink-0 px-3 text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100 border border-ground-700 hover:border-ground-500 rounded-sharp"
          >
            {t('npc.dialogClose')}
          </button>
        </header>

        <div className="border-l-2 border-ember-600 pl-4 py-2 text-[15px] leading-relaxed text-ground-100">
          {line}
        </div>

        {responseAck ? (
          <div className="text-[12px] text-moss-400 font-display uppercase tracking-tightest">
            {t('npc.responseSent')}
          </div>
        ) : account ? (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
              {t('npc.responsePrompt')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ResponseButton onClick={handleRespond} label={t('npc.responseGreet')} />
              <ResponseButton onClick={handleRespond} label={t('npc.responseAsk')} />
              <ResponseButton onClick={handleRespond} label={t('npc.responseTrade')} />
              <ResponseButton onClick={handleRespond} label={t('npc.responseLeave')} />
            </div>
          </div>
        ) : (
          <div className="border border-ground-700 rounded-sharp p-3 text-[12px] text-ground-300 leading-relaxed">
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500 mb-1">
              {t('npc.responseLogin')}
            </div>
            {t('npc.responseLockedHint')}
          </div>
        )}
      </div>
    </div>
  )
}

function ResponseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gi-touch px-4 text-left text-[13px] text-ground-200 border border-ground-700 hover:border-ember-600 hover:text-ember-300 hover:bg-ember-500/5 rounded-sharp transition-colors"
    >
      {label}
    </button>
  )
}
