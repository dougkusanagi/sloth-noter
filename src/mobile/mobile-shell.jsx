import './mobile.css'
import { useInsets } from './use-insets.js'

// Placeholder for the mobile shell (docs/plano-mobile-v2.md, phase 2 onwards).
export function MobileShell() {
  useInsets()
  return (
    <main className="mobile-shell" data-platform="mobile">
      <h1>Sloth Note</h1>
    </main>
  )
}
