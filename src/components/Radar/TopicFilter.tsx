import { Topic } from '@/types/radar'
import {
  Bot,
  Sparkles,
  Link as LinkIcon,
  Users,
  Play,
  LayoutGrid,
  LucideProps,
} from 'lucide-react'

interface TopicFilterProps {
  topics: Topic[]
  selectedTopic: string | null
  onSelectTopic: (topicSlug: string | null) => void
}

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  bot: Bot,
  sparkles: Sparkles,
  link: LinkIcon,
  users: Users,
  play: Play,
}

export function TopicFilter({
  topics,
  selectedTopic,
  onSelectTopic,
}: TopicFilterProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <button
        onClick={() => onSelectTopic(null)}
        className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
          selectedTopic === null
            ? 'bg-[#0ea5e9] text-white'
            : 'radar-glass-button text-white/70 hover:text-white'
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="font-medium">All</span>
      </button>

      {topics.map((topic) => {
        const Icon = topic.icon ? iconMap[topic.icon] || LayoutGrid : LayoutGrid
        const isSelected = selectedTopic === topic.slug

        return (
          <button
            key={topic.id}
            onClick={() => onSelectTopic(topic.slug)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
              isSelected
                ? 'text-white'
                : 'radar-glass-button text-white/70 hover:text-white'
            }`}
            style={{
              backgroundColor: isSelected ? topic.color || '#0ea5e9' : undefined,
            }}
          >
            <Icon className="w-4 h-4" />
            <span className="font-medium">{topic.name}</span>
          </button>
        )
      })}
    </div>
  )
}
