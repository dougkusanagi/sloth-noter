import { useEffect, useState } from 'react'
import { version as buildVersion } from '../../package.json'
import { t } from '../i18n.js'

const isTauri = () =>
  typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__?.invoke === 'function'

/** Native metadata in the packaged app; the build version in the browser preview. */
function useAppVersion() {
  const [version, setVersion] = useState(buildVersion)
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((native) => {
        if (!cancelled && native) setVersion(native)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return version
}

/** Name and version shared by the desktop Settings dialog and the mobile shell. */
export function AboutPanel() {
  const version = useAppVersion()
  return (
    <div className="about-panel">
      <p className="about-line">Sloth Note · {t('about.version', { version })}</p>
      <p className="about-description">{t('about.description')}</p>
    </div>
  )
}
