/**
 * Serializes document writes and keeps only the newest state while a write is
 * in flight, so a slow disk neither delays typing nor writes an older document
 * after a newer one.
 */
export function createWriteQueue(save, onResult = () => {}) {
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
      onResult(error)
    })
    return tail
  }

  return {
    write(document) {
      pending = document
      return schedule()
    },
    whenIdle() {
      return tail
    },
  }
}
