import type { DragEvent } from 'react'

export function fileDrop(upload: (file: File) => void) {
  return {
    onDragOver(event: DragEvent) {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    onDrop(event: DragEvent) {
      const file = event.dataTransfer.files[0]
      if (!file) return
      event.preventDefault()
      event.stopPropagation()
      upload(file)
    },
  }
}
