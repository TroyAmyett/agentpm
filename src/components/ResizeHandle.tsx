import { useCallback, useEffect, useState } from 'react'

interface ResizeHandleProps {
  side: 'left' | 'right'
  onResize: (delta: number) => void
}

export function ResizeHandle({ side, onResize }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setStartX(e.clientX)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX
      const adjustedDelta = side === 'left' ? delta : -delta
      onResize(adjustedDelta)
      setStartX(e.clientX)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, startX, side, onResize])

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        absolute top-0 bottom-0 w-3 cursor-col-resize z-50
        group
        ${side === 'left' ? 'left-0 -ml-1.5' : 'right-0 -mr-1.5'}
      `}
      style={{
        touchAction: 'none',
      }}
    >
      {/* Hover/drag highlight area */}
      <div
        className={`
          absolute inset-0 transition-colors duration-150
          ${isDragging ? 'bg-primary-500/30' : 'group-hover:bg-primary-400/20'}
        `}
      />
      {/* Visual indicator line that appears on hover */}
      <div
        className={`
          absolute top-1/2 -translate-y-1/2 w-1 h-16 rounded-full
          transition-all duration-150
          ${isDragging
            ? 'bg-primary-500 opacity-100'
            : 'bg-surface-500 dark:bg-surface-400 opacity-0 group-hover:opacity-100'
          }
          ${side === 'left' ? 'left-1' : 'right-1'}
        `}
      />
      {/* Grip dots for visual affordance */}
      <div
        className={`
          absolute top-1/2 -translate-y-1/2 flex flex-col gap-1
          transition-opacity duration-150
          ${isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}
          ${side === 'left' ? 'left-0.5' : 'right-0.5'}
        `}
      >
        <div className="w-1 h-1 rounded-full bg-surface-400 dark:bg-surface-500" />
        <div className="w-1 h-1 rounded-full bg-surface-400 dark:bg-surface-500" />
        <div className="w-1 h-1 rounded-full bg-surface-400 dark:bg-surface-500" />
      </div>
    </div>
  )
}
