import { ContentItemWithInteraction, Advisor } from '@/types/radar'
import { ArticleCard, VideoCard } from './cards'
import { Loader2 } from 'lucide-react'

interface CardStreamProps {
  items: ContentItemWithInteraction[]
  advisors?: Record<string, Advisor>
  isLoading?: boolean
  isRefreshing?: boolean
  onLike?: (id: string) => void
  onSave?: (id: string) => void
  onAddNote?: (id: string, note: string) => void
  onDeepDive?: (id: string) => void
  onDismiss?: (id: string) => void
  onCreateTask?: (item: ContentItemWithInteraction) => void
  onSaveToNotes?: (item: ContentItemWithInteraction) => void
}

export function CardStream({
  items,
  isLoading = false,
  isRefreshing = false,
  onLike,
  onSave,
  onAddNote,
  onDeepDive,
  onDismiss,
  onCreateTask,
  onSaveToNotes,
}: CardStreamProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#0ea5e9] animate-spin" />
      </div>
    )
  }

  if (items.length === 0 && isRefreshing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/60">
        <Loader2 className="w-8 h-8 text-[#0ea5e9] animate-spin mb-4" />
        <p className="text-lg">Fetching content from your sources...</p>
        <p className="text-sm mt-1 text-white/40">This may take a moment</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/40">
        <p className="text-lg">No content found</p>
        <p className="text-sm mt-1">Add sources to start seeing content, then click Refresh</p>
      </div>
    )
  }

  return (
    <div className="radar-masonry-grid">
      {items.map((item) => {
        if (item.type === 'video') {
          return (
            <div key={item.id}>
              <VideoCard
                item={item}
                onLike={onLike}
                onSave={onSave}
                onAddNote={onAddNote}
                onDeepDive={onDeepDive}
                onDismiss={onDismiss}
                onCreateTask={onCreateTask}
                onSaveToNotes={onSaveToNotes}
              />
            </div>
          )
        }

        return (
          <div key={item.id}>
            <ArticleCard
              item={item}
              onLike={onLike}
              onSave={onSave}
              onAddNote={onAddNote}
              onDeepDive={onDeepDive}
              onDismiss={onDismiss}
              onCreateTask={onCreateTask}
              onSaveToNotes={onSaveToNotes}
            />
          </div>
        )
      })}
    </div>
  )
}
