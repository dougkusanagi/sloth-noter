let nextId = 0

// Android's document picker owns overwrite confirmation and its returned URI.
export function saveTextFile(name, mime, body) {
  if (!window.SlothShare?.saveText && window.__TAURI_INTERNALS__)
    return Promise.reject(new Error('Android file picker unavailable'))
  if (!window.SlothShare?.saveText) {
    const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return Promise.resolve('download')
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId
    window.__slothFileResult = (received, status) => {
      if (received !== id) return
      delete window.__slothFileResult
      if (status === 'saved' || status === 'cancelled') resolve(status)
      else reject(new Error('Could not save file'))
    }
    try {
      window.SlothShare.saveText(name, mime, body, id)
    } catch (error) {
      delete window.__slothFileResult
      reject(error)
    }
  })
}
