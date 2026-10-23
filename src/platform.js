// The platform picks the shell (navigation, bars, menus). Window width never does:
// a narrow desktop window stays desktop.
export function detectPlatform({ target, search } = {}) {
  if (target === 'mobile') return 'mobile'
  if (target === 'desktop') return 'desktop'
  // Outside a mobile build, `?platform=mobile` previews the mobile shell in a browser (dev only).
  return new URLSearchParams(search ?? '').get('platform') === 'mobile' ? 'mobile' : 'desktop'
}

export const platform = detectPlatform({
  target: import.meta.env?.VITE_TARGET,
  search: import.meta.env?.DEV && typeof location !== 'undefined' ? location.search : '',
})
