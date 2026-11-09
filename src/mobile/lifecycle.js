// Android may hide or unload the page without a close event. Both cases must flush the
// note and history queues, even when the write itself is still finishing in the background.
export function flushOnHide(target, flush) {
  const onVisibility = () => {
    if (target.document.visibilityState === 'hidden') flush()
  }
  const onPageHide = () => flush()
  target.document.addEventListener('visibilitychange', onVisibility)
  target.addEventListener('pagehide', onPageHide)
  return () => {
    target.document.removeEventListener('visibilitychange', onVisibility)
    target.removeEventListener('pagehide', onPageHide)
  }
}
