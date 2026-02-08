// TipTap custom node extension for Excalidraw drawing blocks
// Stores Excalidraw scene data as a JSON string in node attrs

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ExcalidrawBlock } from './ExcalidrawBlock'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    excalidraw: {
      insertExcalidraw: () => ReturnType
    }
  }
}

export const ExcalidrawNode = Node.create({
  name: 'excalidraw',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      data: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-excalidraw'),
        renderHTML: (attributes) => {
          if (!attributes.data) return {}
          return { 'data-excalidraw': attributes.data }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-excalidraw]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'excalidraw' })]
  },

  addNodeView() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ReactNodeViewRenderer(ExcalidrawBlock as any)
  },

  addCommands() {
    return {
      insertExcalidraw:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { data: null },
          })
        },
    }
  },
})
