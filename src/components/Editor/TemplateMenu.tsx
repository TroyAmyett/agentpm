import { useState } from 'react'
import { useNotesStore } from '@/stores/notesStore'
import { projectTemplates } from '@/utils/templates'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@funnelists/ui'
import {
  FileText,
  ClipboardList,
  Users,
  Lightbulb,
  Code,
  GitBranch,
  Plus,
  ChevronDown,
  Layout,
} from 'lucide-react'

const iconMap: Record<string, React.ReactNode> = {
  'file-text': <FileText size={16} />,
  'clipboard-list': <ClipboardList size={16} />,
  'users': <Users size={16} />,
  'lightbulb': <Lightbulb size={16} />,
  'code': <Code size={16} />,
  'git-branch': <GitBranch size={16} />,
}

export function TemplateMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const { addNote, setCurrentNote } = useNotesStore()

  const handleSelectTemplate = async (templateId: string) => {
    const template = projectTemplates.find((t) => t.id === templateId)
    if (!template) return

    const newNote = await addNote({
      title: template.name,
      content: template.content,
    })

    setCurrentNote(newNote.id)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        rightIcon={<ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
      >
        <Layout size={16} />
        Templates
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 350 }}
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-0 top-full mt-1 rounded-lg shadow-lg min-w-[280px]"
              style={{
                zIndex: 400,
                background: 'var(--fl-color-bg-surface)',
                border: '1px solid var(--fl-color-border)',
                padding: 'var(--fl-spacing-sm) 0'
              }}
            >
              <div
                style={{
                  padding: '0 var(--fl-spacing-sm) var(--fl-spacing-sm)',
                  marginBottom: 'var(--fl-spacing-xs)',
                  borderBottom: '1px solid var(--fl-color-border)'
                }}
              >
                <p
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--fl-color-text-muted)' }}
                >
                  New from Template
                </p>
              </div>

              <div className="max-h-[400px] overflow-y-auto" style={{ padding: 'var(--fl-spacing-sm) var(--fl-spacing-md)' }}>
                {projectTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template.id)}
                    className="w-full flex items-start gap-3 rounded-md"
                    style={{
                      padding: 'var(--fl-spacing-sm) var(--fl-spacing-md)',
                      marginBottom: 'var(--fl-spacing-sm)',
                      transition: 'var(--fl-transition-fast)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
                      style={{
                        background: 'rgba(14, 165, 233, 0.15)',
                        color: 'var(--fl-color-primary)'
                      }}
                    >
                      {iconMap[template.icon] || <FileText size={16} />}
                    </div>
                    <div className="text-left">
                      <div
                        className="font-medium text-sm"
                        style={{ color: 'var(--fl-color-text-primary)' }}
                      >
                        {template.name}
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: 'var(--fl-color-text-muted)' }}
                      >
                        {template.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div
                style={{
                  padding: 'var(--fl-spacing-sm) var(--fl-spacing-sm) 0',
                  marginTop: 'var(--fl-spacing-xs)',
                  borderTop: '1px solid var(--fl-color-border)'
                }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    addNote({ title: 'Untitled' })
                    setIsOpen(false)
                  }}
                  leftIcon={<Plus size={16} />}
                  className="w-full justify-start"
                  style={{ color: 'var(--fl-color-primary)' }}
                >
                  Blank Note
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
