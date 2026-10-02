/**
 * Serializes document writes and keeps only the newest state while a write is
 * in flight, so a slow disk neither delays typing nor writes an older document
 * after a newer one.
 */
export function createWriteQueue(save, onResult = () => {}, onBusy = () => {}) {
  let lastResult
  let pending = null
  let scheduled = false
  let tail = Promise.resolve()

  function schedule() {
    if (scheduled || pending === null) return tail
    scheduled = true
    tail = tail.then(async () => {
      scheduled = false
      const document = pending
      pending = null
      let error
      try {
        error = await save(document)
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Storage is unavailable'
      }
      lastResult = error
      onResult(error)
      if (pending === null && !scheduled) onBusy(false)
    })
    return tail
  }

  return {
    write(document) {
      pending = document
      onBusy(true)
      return schedule()
    },
    async whenIdle() {
      let observed
      do {
        observed = tail
        await observed
      } while (observed !== tail)
      return lastResult
    },
  }
}
