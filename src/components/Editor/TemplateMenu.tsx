import { useState, useEffect } from 'react'
import { useNotesStore } from '@/stores/notesStore'
import { useTemplatesStore } from '@/stores/templatesStore'
import { projectTemplates } from '@/utils/templates'
import { motion, AnimatePresence } from 'framer-motion'
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
  Star,
  Trash2,
  User,
  Pencil,
} from 'lucide-react'
import { SaveAsTemplateModal } from './SaveAsTemplateModal'
import type { UserTemplate } from '@/types'

const iconMap: Record<string, React.ReactNode> = {
  'file-text': <FileText size={16} />,
  'clipboard-list': <ClipboardList size={16} />,
  'users': <Users size={16} />,
  'lightbulb': <Lightbulb size={16} />,
  'code': <Code size={16} />,
  'git-branch': <GitBranch size={16} />,
  'user': <User size={16} />,
}

export function TemplateMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<UserTemplate | null>(null)
  const { addNote, setCurrentNote, userId, isAuthenticated } = useNotesStore()
  const { templates: userTemplates, loadTemplates, deleteTemplate, toggleFavorite, updateTemplate } = useTemplatesStore()

  // Load user templates when authenticated
  useEffect(() => {
    if (isAuthenticated && userId) {
      loadTemplates(userId)
    }
  }, [isAuthenticated, userId, loadTemplates])

  const handleSelectBuiltinTemplate = async (templateId: string) => {
    const template = projectTemplates.find((t) => t.id === templateId)
    if (!template) return

    const newNote = await addNote({
      title: template.name,
      content: template.content,
    })

    setCurrentNote(newNote.id)
    setIsOpen(false)
  }

  const handleSelectUserTemplate = async (template: UserTemplate) => {
    const newNote = await addNote({
      title: template.name,
      content: template.content,
    })

    setCurrentNote(newNote.id)
    setIsOpen(false)
  }

  const handleDeleteTemplate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirm('Delete this template?')) {
      await deleteTemplate(id)
    }
  }

  const handleToggleFavorite = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await toggleFavorite(id)
  }

  const handleEditTemplate = (e: React.MouseEvent, template: UserTemplate) => {
    e.stopPropagation()
    setIsOpen(false)
    setEditingTemplate(template)
  }

  const handleUpdateTemplate = async (data: {
    name: string
    description: string
    icon: string
    category: string
  }) => {
    if (!editingTemplate) return
    await updateTemplate(editingTemplate.id, {
      name: data.name,
      description: data.description || null,
      icon: data.icon,
      category: data.category || null,
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
        style={{ color: 'var(--fl-color-text-secondary)' }}
      >
        <Layout size={16} />
        Templates
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

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
              className="absolute left-0 top-full mt-1 rounded-lg shadow-lg min-w-[320px]"
              style={{
                zIndex: 400,
                background: 'var(--fl-color-bg-surface)',
                border: '1px solid var(--fl-color-border)',
                padding: 'var(--fl-spacing-sm) 0'
              }}
            >
              {/* User Templates Section */}
              {isAuthenticated && userTemplates.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '0 var(--fl-spacing-md) var(--fl-spacing-sm)',
                      marginBottom: 'var(--fl-spacing-xs)',
                    }}
                  >
                    <p
                      className="text-xs font-medium uppercase tracking-wider"
                      style={{ color: 'var(--fl-color-text-muted)' }}
                    >
                      My Templates
                    </p>
                  </div>

                  <div className="max-h-[200px] overflow-y-auto" style={{ padding: '0 var(--fl-spacing-sm)' }}>
                    {userTemplates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleSelectUserTemplate(template)}
                        className="w-full flex items-center gap-3 rounded-md group"
                        style={{
                          padding: 'var(--fl-spacing-sm) var(--fl-spacing-md)',
                          marginBottom: 'var(--fl-spacing-xs)',
                          transition: 'var(--fl-transition-fast)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <div
                          className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
                          style={{
                            background: 'rgba(139, 92, 246, 0.15)',
                            color: 'rgb(139, 92, 246)'
                          }}
                        >
                          {iconMap[template.icon] || <FileText size={16} />}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div
                            className="font-medium text-sm truncate"
                            style={{ color: 'var(--fl-color-text-primary)' }}
                          >
                            {template.name}
                          </div>
                          {template.description && (
                            <div
                              className="text-xs truncate"
                              style={{ color: 'var(--fl-color-text-muted)' }}
                            >
                              {template.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleEditTemplate(e, template)}
                            className="p-1 rounded hover:bg-black/10 text-gray-400"
                            title="Edit template"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={(e) => handleToggleFavorite(e, template.id)}
                            className="p-1 rounded hover:bg-black/10"
                            title={template.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <Star
                              size={14}
                              className={template.is_favorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}
                            />
                          </button>
                          <button
                            onClick={(e) => handleDeleteTemplate(e, template.id)}
                            className="p-1 rounded hover:bg-red-100 text-red-500"
                            title="Delete template"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div
                    style={{
                      borderBottom: '1px solid var(--fl-color-border)',
                      margin: 'var(--fl-spacing-sm) 0',
                    }}
                  />
                </>
              )}

              {/* Built-in Templates Section */}
              <div
                style={{
                  padding: '0 var(--fl-spacing-md) var(--fl-spacing-sm)',
                  marginBottom: 'var(--fl-spacing-xs)',
                }}
              >
                <p
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--fl-color-text-muted)' }}
                >
                  {userTemplates.length > 0 ? 'Built-in Templates' : 'New from Template'}
                </p>
              </div>

              <div className="max-h-[300px] overflow-y-auto" style={{ padding: '0 var(--fl-spacing-sm)' }}>
                {projectTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectBuiltinTemplate(template.id)}
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
                <button
                  onClick={() => {
                    addNote({ title: 'Untitled' })
                    setIsOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                  style={{ color: 'var(--fl-color-primary)' }}
                >
                  <Plus size={16} />
                  Blank Note
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Template Modal */}
      <SaveAsTemplateModal
        isOpen={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
        onSave={handleUpdateTemplate}
        template={editingTemplate || undefined}
      />
    </div>
  )
}
