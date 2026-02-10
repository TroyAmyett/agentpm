import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-sm bg-white dark:bg-surface-800 rounded-xl shadow-xl pointer-events-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700">
                <div className="flex items-center gap-2 text-red-500">
                  <AlertTriangle size={20} />
                  <h3 className="text-lg font-semibold">{title}</h3>
                </div>
                <button
                  onClick={onCancel}
                  className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-4">
                <p className="text-sm text-surface-600 dark:text-surface-300">{message}</p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 p-4 border-t border-surface-200 dark:border-surface-700">
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
