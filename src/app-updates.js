/** Download completion is not readiness: download() also verifies the signature. */
export async function downloadUpdate(update, onProgress) {
  let total = 0
  let downloaded = 0
  await update.download(
    (event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0
        downloaded = 0
      } else if (event.event === 'Progress') downloaded += event.data.chunkLength
      onProgress({
        verifying: event.event === 'Finished',
        percent: total > 0 ? Math.min(99, Math.floor((downloaded / total) * 100)) : null,
      })
    },
    { timeout: 300000 },
  )
}

/** Force debounced writes out and refuse to exit on any note-save failure. */
export async function saveBeforeUpdate(writer, document, history) {
  void writer.write(document)
  const failure = await writer.whenIdle()
  if (failure) throw new Error('Notes could not be saved')
  await history.flush()
  const lateFailure = await writer.whenIdle()
  if (lateFailure) throw new Error('Notes could not be saved')
}
