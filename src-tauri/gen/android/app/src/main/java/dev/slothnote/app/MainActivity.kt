package dev.slothnote.app

import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var imeHeight = 0
  private var keyboard = "closed"
  private var animating = false

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val content = findViewById<View>(android.R.id.content)
    // The WebView is not padded: its background stays the app's. CSS reads these values
    // (public/insets-boot.js) and pads only the mobile shell.
    ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
      imeHeight = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      if (!animating) keyboard = if (imeHeight > 0) "open" else "closed"
      publish(insets, 1f)
      insets
    }
    ViewCompat.setWindowInsetsAnimationCallback(content, imeAnimation)
  }

  // Sends the keyboard's animation to the web layer, so the bottom bar moves with the keyboard.
  private val imeAnimation =
    object : WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_STOP) {
      override fun onStart(
        animation: WindowInsetsAnimationCompat,
        bounds: WindowInsetsAnimationCompat.BoundsCompat,
      ): WindowInsetsAnimationCompat.BoundsCompat {
        if ((animation.typeMask and WindowInsetsCompat.Type.ime()) != 0) {
          animating = true
          keyboard = if (imeHeight == 0) "opening" else "closing"
        }
        return bounds
      }

      override fun onProgress(
        insets: WindowInsetsCompat,
        runningAnimations: List<WindowInsetsAnimationCompat>,
      ): WindowInsetsCompat {
        val ime = runningAnimations.firstOrNull {
          (it.typeMask and WindowInsetsCompat.Type.ime()) != 0
        } ?: return insets
        imeHeight = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
        publish(insets, ime.interpolatedFraction)
        return insets
      }

      override fun onEnd(animation: WindowInsetsAnimationCompat) {
        if ((animation.typeMask and WindowInsetsCompat.Type.ime()) != 0) {
          animating = false
          keyboard = if (imeHeight > 0) "open" else "closed"
        }
      }
    }

  private fun publish(insets: WindowInsetsCompat, progress: Float) {
    val bars: Insets = insets.getInsets(
      WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
    )
    val density = resources.displayMetrics.density
    fun dp(px: Int): Int = Math.round(px / density)
    // Values are dp; the WebView's CSS pixels match dp at the default text zoom.
    val script = "window.__insets?.({" +
      "top:${dp(bars.top)},bottom:${dp(bars.bottom)}," +
      "left:${dp(bars.left)},right:${dp(bars.right)}," +
      "ime:${dp(imeHeight)},keyboard:'$keyboard',progress:$progress})"
    webView?.evaluateJavascript(script, null)
  }
}
