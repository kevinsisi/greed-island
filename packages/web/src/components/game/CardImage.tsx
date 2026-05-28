// Reusable card image component — shows the AI-generated illustration if
// available, falls back to the rank-letter colored square placeholder.

import { useState } from 'react'

const RANK_COLORS: Record<string, string> = {
  S: 'bg-ember-500/20 border-ember-500 text-ember-200',
  A: 'bg-moss-500/20 border-moss-500 text-moss-200',
  B: 'bg-sky-500/20 border-sky-600 text-sky-200',
  C: 'bg-ground-700 border-ground-500 text-ground-300',
  D: 'bg-ground-800 border-ground-600 text-ground-500',
}

interface CardImageProps {
  imageUrl?: string
  rank: string
  nameZh: string
  /** Extra CSS classes applied to the root element. */
  className?: string
  /** Square pixel size for the rank placeholder (default 40). */
  placeholderSize?: number
}

export function CardImage({ imageUrl, rank, nameZh, className = '', placeholderSize = 40 }: CardImageProps) {
  const [failed, setFailed] = useState(false)

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={nameZh}
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
        loading="lazy"
      />
    )
  }

  const colorClass = RANK_COLORS[rank] ?? RANK_COLORS['D']
  return (
    <span
      style={{ width: placeholderSize, height: placeholderSize }}
      className={`inline-flex items-center justify-center rounded-sharp border ${colorClass} font-display font-extrabold ${className}`}
      aria-label={`${rank} rank`}
    >
      {rank}
    </span>
  )
}
