/** Serialize saves, coalescing edits until typing pauses or maxWait is reached. */
export function createWriteQueue(
  save,
  onResult = () => {},
  onBusy = () => {},
  { debounceMs = 0, maxWaitMs = 5000 } = {},
) {
  let lastResult
  let pending = null
  let running = false
  let ready = false
  let timer = null
  let deadline = null
  const waiters = []

  function clearTimers() {
    clearTimeout(timer)
    clearTimeout(deadline)
    timer = deadline = null
  }

  async function drain() {
    if (running || !ready || pending === null) return
    clearTimers()
    running = true
    ready = false
    const document = pending
    pending = null
    try {
      lastResult = await save(document)
    } catch (cause) {
      lastResult = cause instanceof Error ? cause.message : 'Storage is unavailable'
    }
    onResult(lastResult)
    running = false
    if (pending !== null) {
      void drain()
    } else {
      onBusy(false)
      for (const resolve of waiters.splice(0)) resolve(lastResult)
    }
  }

  function release() {
    clearTimers()
    ready = true
    void drain()
  }

  function whenIdle({ flush = true } = {}) {
    if (!running && pending === null) return Promise.resolve(lastResult)
    const idle = new Promise((resolve) => waiters.push(resolve))
    if (flush && pending !== null) release()
    return idle
  }

  return {
    write(document) {
      pending = document
      onBusy(true)
      if (debounceMs === 0) {
        ready = true
        queueMicrotask(drain)
      } else {
        ready = false
        clearTimeout(timer)
        timer = setTimeout(release, debounceMs)
        if (deadline === null) deadline = setTimeout(release, maxWaitMs)
      }
      return whenIdle({ flush: false })
    },
    // Explicit actions flush immediately; background scans only wait for autosave.
    whenIdle,
  }
}
