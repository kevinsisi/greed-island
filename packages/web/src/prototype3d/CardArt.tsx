import type { CardId } from './types'
import './card-art.css'

export const CARD_ART = {
  ember: { description: '火鳳從苔岩神殿的古燈升起，金色火花照亮深林。', position: '50% 35%' },
  tide: { description: '治癒的水弧托起螺貝中的明珠，銀魚穿過月光下的潮池。', position: '50% 44%' },
  wind: { description: '白羽喚起流風，金色落葉在海島遺跡間鋪成懸空古道。', position: '50% 41%' },
} satisfies Record<CardId, { description: string; position: string }>

/** Original generated illustrations; all decoration remains vector sharp. */
export function CardArt({ card, large = false }: { card: CardId; large?: boolean }) {
  const art = CARD_ART[card]
  return (
    <span
      className={`p3d-card-art p3d-card-art--${card}${large ? ' p3d-card-art--large' : ''}`}
      role={large ? 'img' : undefined}
      aria-label={large ? art.description : undefined}
      aria-hidden={large ? undefined : true}
    >
      <img
        className="p3d-card-illustration"
        src={`/prototype3d/cards/${card}${large ? '' : '-thumb'}.jpg`}
        alt=""
        width={large ? 768 : 256}
        height={large ? 1152 : 384}
        decoding="async"
        loading={large ? 'lazy' : 'eager'}
        draggable={false}
        style={{ objectPosition: art.position }}
      />
      <span className="p3d-art-vignette" />
      <svg className="p3d-art-frame" viewBox="0 0 200 300" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <path d="M21 7H179L193 21V279L179 293H21L7 279V21Z" stroke="currentColor" strokeWidth="1.3" />
        <path d="M29 13H171L187 29V271L171 287H29L13 271V29Z" stroke="currentColor" strokeWidth=".45" opacity=".65" />
        <path d="M7 44V7H44M156 7H193V44M193 256V293H156M44 293H7V256" stroke="currentColor" strokeWidth="2" />
        <path d="M17 36L36 17M164 17L183 36M183 264L164 283M36 283L17 264" stroke="currentColor" strokeWidth="1" />
        <path d="M100 5L107 12L100 19L93 12ZM100 281L107 288L100 295L93 288Z" fill="currentColor" />
        <path d="M15 25L25 15M175 15L185 25M185 275L175 285M25 285L15 275" stroke="currentColor" strokeWidth="3" />
      </svg>
      <span className="p3d-art-seal" aria-hidden="true">
        {card === 'ember' ? 'Ⅰ' : card === 'tide' ? 'Ⅱ' : 'Ⅲ'}
      </span>
    </span>
  )
}

export default CardArt
