import { main as updateAppImage } from './update-appimage.mjs'
import { main as updateWindows } from './update-windows.mjs'

async function main() {
  if (process.platform === 'linux') return updateAppImage()
  if (process.platform === 'win32') return updateWindows()
  throw new Error('desktop:update suporta Linux (AppImage) e Windows (MSI).')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
