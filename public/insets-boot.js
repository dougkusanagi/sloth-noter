// Runs before the app bundle, so the first frame already has the system insets.
// Classic script, not inline: the Tauri CSP allows only 'self' scripts.
// The Android shell (MainActivity.kt) calls window.__insets; the browser fallback is in src/mobile/use-insets.js.
;(function () {
  var root = document.documentElement
  var values = { top: 0, bottom: 0, left: 0, right: 0, ime: 0, keyboard: 'closed', progress: 1 }

  function apply(next) {
    values = Object.assign({}, values, next)
    var style = root.style
    style.setProperty('--inset-top', values.top + 'px')
    style.setProperty('--inset-bottom', values.bottom + 'px')
    style.setProperty('--inset-left', values.left + 'px')
    style.setProperty('--inset-right', values.right + 'px')
    style.setProperty('--ime-bottom', values.ime + 'px')
    style.setProperty('--ime-progress', values.progress)
    root.dataset.keyboard = values.keyboard
  }

  // Values in CSS pixels (dp on Android). Once the native shell reports, the fallback stops.
  window.__insets = function (next) {
    window.__nativeInsets = true
    apply(next)
  }
  window.__insetsFallback = function (next) {
    if (!window.__nativeInsets) apply(next)
  }
})()
