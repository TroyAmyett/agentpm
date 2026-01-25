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
        absolute top-0 bottom-0 w-2 cursor-col-resize z-50
        hover:bg-primary-400/50 active:bg-primary-500/50
        transition-colors duration-150
        ${side === 'left' ? 'left-0 -ml-1' : 'right-0 -mr-1'}
        ${isDragging ? 'bg-primary-500/50' : 'bg-transparent'}
      `}
      style={{
        touchAction: 'none',
      }}
    >
      {/* Visual indicator that appears on hover */}
      <div
        className={`
          absolute top-1/2 -translate-y-1/2 w-1 h-12 rounded-full
          bg-surface-400 dark:bg-surface-500
          opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity
          ${side === 'left' ? 'left-0.5' : 'right-0.5'}
        `}
      />
    </div>
  )
}
