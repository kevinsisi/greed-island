import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type ServerCardCatalogEntry } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { PageHeader } from '../components/common/PageHeader'
import { CardImage } from '../components/game/CardImage'
import { CARD_ART_BASE_STYLE, getFullCardPrompt } from '../data/cardArtPrompts'

const RANK_ORDER = ['S', 'A', 'B', 'C', 'D'] as const

type ImageMap = Record<number, string>

type PageState =
  | { kind: 'loading' }
  | { kind: 'ready'; cards: ServerCardCatalogEntry[]; images: ImageMap }
  | { kind: 'error'; message: string }

type UploadState = Record<number, 'uploading' | 'deleting' | 'done' | string>

export function AdminCardsPage() {
  const { token, account } = useAuth()
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [uploadState, setUploadState] = useState<UploadState>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingCardId = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const [catalogData, imagesData] = await Promise.all([
        api.cards(),
        api.adminCardImages(token),
      ])
      setState({ kind: 'ready', cards: catalogData.entries as ServerCardCatalogEntry[], images: imagesData.images })
    } catch (err) {
      const message =
        err instanceof ApiError && (err.status === 401 || err.status === 403)
          ? '無權限：需要 GM 以上角色'
          : err instanceof Error
            ? err.message
            : '載入失敗'
      setState({ kind: 'error', message })
    }
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const id = pendingCardId.current
      if (!token || id === null) return
      const file = e.target.files?.[0]
      if (!file) return
      if (fileInputRef.current) fileInputRef.current.value = ''

      setUploadState((prev) => ({ ...prev, [id]: 'uploading' }))
      try {
        const arrayBuffer = await file.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        const chunk = 8192
        for (let i = 0; i < bytes.byteLength; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
        }
        const base64 = btoa(binary)
        await api.adminUploadCardImage(token, id, base64, file.type)
        setUploadState((prev) => ({ ...prev, [id]: 'done' }))
        await refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : '上傳失敗'
        setUploadState((prev) => ({ ...prev, [id]: message }))
      }
    },
    [token, refresh]
  )

  const handleDelete = useCallback(
    async (id: number) => {
      if (!token) return
      setUploadState((prev) => ({ ...prev, [id]: 'deleting' }))
      try {
        await api.adminDeleteCardImage(token, id)
        setUploadState((prev) => ({ ...prev, [id]: 'done' }))
        await refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : '刪除失敗'
        setUploadState((prev) => ({ ...prev, [id]: message }))
      }
    },
    [token, refresh]
  )

  const triggerUpload = (id: number) => {
    pendingCardId.current = id
    fileInputRef.current?.click()
  }

  if (!token || !account) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="GM 工具" title="卡片美術管理" description="上傳與管理每張紋卡的美術圖片" />
        <section className="gi-panel p-5 text-sm text-ground-300">請先登入 GM 帳號</section>
      </div>
    )
  }

  const coverCount = state.kind === 'ready' ? Object.keys(state.images).length : 0
  const totalCount = state.kind === 'ready' ? state.cards.length : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="GM 工具"
        title="卡片美術管理"
        description={`上傳與管理每張紋卡的美術圖片（${coverCount} / ${totalCount} 已上傳）`}
      />

      {/* hidden file input shared across all cards */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/webp,image/png,image/jpeg"
        className="hidden"
        onChange={handleFileChange}
      />

      {state.kind === 'loading' && (
        <div className="gi-panel p-5 text-sm text-ground-300">載入中…</div>
      )}

      {state.kind === 'error' && (
        <div className="gi-panel p-5 text-sm text-ember-400">{state.message}</div>
      )}

      {state.kind === 'ready' && (
        <div className="flex flex-col gap-8">
          {/* base style prompt panel */}
          <BaseStylePanel />
          {RANK_ORDER.map((rank) => {
            const rankCards = state.cards.filter((c) => c.rank === rank)
            return (
              <section key={rank} className="flex flex-col gap-3">
                <h2 className="font-display font-bold text-sm text-ground-300 uppercase tracking-widest">
                  Rank {rank} — {rankCards.length} 張
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {rankCards.map((card) => {
                    const imageUrl = state.images[card.id]
                    const busy = uploadState[card.id]
                    const isUploading = busy === 'uploading'
                    const isDeleting = busy === 'deleting'
                    const hasError = busy && busy !== 'uploading' && busy !== 'deleting' && busy !== 'done'

                    return (
                      <div
                        key={card.id}
                        className="gi-panel flex flex-col gap-2 p-3 text-xs"
                      >
                        {/* image preview */}
                        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sharp bg-ground-800">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={card.nameZh}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <CardImage rank={card.rank} nameZh={card.nameZh} cardId={card.id} placeholderSize={48} className="h-full w-full" />
                            </div>
                          )}
                          {(isUploading || isDeleting) && (
                            <div className="absolute inset-0 flex items-center justify-center bg-ground-900/70 text-ground-300">
                              {isUploading ? '上傳中…' : '刪除中…'}
                            </div>
                          )}
                        </div>

                        {/* card info */}
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-medium text-ground-100 leading-tight">{card.nameZh}</span>
                          <span className="shrink-0 text-ground-400">#{card.id}</span>
                        </div>
                        <span className="text-ground-400">{card.category}</span>

                        {hasError && (
                          <span className="text-ember-400 leading-tight">{busy}</span>
                        )}

                        {/* actions */}
                        <div className="flex gap-1 mt-auto flex-wrap">
                          <button
                            onClick={() => triggerUpload(card.id)}
                            disabled={isUploading || isDeleting}
                            className="flex-1 rounded-sharp bg-ground-700 px-2 py-1 text-ground-200 hover:bg-ground-600 disabled:opacity-40"
                          >
                            {imageUrl ? '換圖' : '上傳'}
                          </button>
                          {imageUrl && (
                            <button
                              onClick={() => void handleDelete(card.id)}
                              disabled={isUploading || isDeleting}
                              className="rounded-sharp bg-ember-900/50 px-2 py-1 text-ember-400 hover:bg-ember-900 disabled:opacity-40"
                            >
                              刪
                            </button>
                          )}
                          <CopyPromptButton cardId={card.id} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BaseStylePanel() {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    void navigator.clipboard.writeText(CARD_ART_BASE_STYLE).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <section className="gi-panel p-4 flex flex-col gap-2 border-amber-700/30">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xs uppercase tracking-tightest text-ground-400">主要風格 Prompt（每張卡都要加）</h2>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded-sharp bg-ground-700 px-3 py-1 text-xs text-ground-200 hover:bg-ground-600 transition-colors"
        >
          {copied ? '已複製 ✓' : '複製'}
        </button>
      </div>
      <p className="text-xs text-ground-300 font-mono leading-relaxed break-words">{CARD_ART_BASE_STYLE}</p>
    </section>
  )
}

function CopyPromptButton({ cardId }: { cardId: number }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    void navigator.clipboard.writeText(getFullCardPrompt(cardId)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title="複製完整 prompt（主要風格 + 卡片描述）"
      className="rounded-sharp bg-ground-700 px-2 py-1 text-ground-400 hover:bg-ground-600 hover:text-ground-200 transition-colors"
    >
      {copied ? '✓' : 'P'}
    </button>
  )
}
