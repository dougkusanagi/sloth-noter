const NOTE_FILE = /\.(md|markdown|txt)$/i

export const isNoteFile = (file) => NOTE_FILE.test(file.name)

/** Dropped Markdown and text files become notes; everything else is left for images. */
export function splitDrop(files) {
  return {
    notes: files.filter(isNoteFile),
    others: files.filter((file) => !isNoteFile(file)),
  }
}

/** Native drops carry a path the backend reads; browser drops carry a File. */
export function readNoteFile(file, invoke) {
  if (file.nativePath) return invoke('note_read_dropped', { path: file.nativePath })
  return file.text()
}
