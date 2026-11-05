package dev.slothnote.app

import android.content.ClipData
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File

class MainActivity : TauriActivity() {
  // One-shot action from a launcher shortcut. The web layer takes it once, so a repeated
  // intent (rotation, resume) never creates a second note.
  private var pendingAction: String? = null
  private var pendingText: String? = null
  private var webView: WebView? = null
  private var imeHeight = 0
  private var keyboard = "closed"
  private var animating = false

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    webView.addJavascriptInterface(ShareBridge(), "SlothShare")
    webView.addJavascriptInterface(SystemBridge(), "SlothSystem")
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    if (savedInstanceState == null) readAction(intent)
    File(cacheDir, "shared").listFiles()?.forEach { it.delete() }
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

  // Dark app theme -> light bar icons; light theme -> dark icons, whatever the device theme is.
  inner class SystemBridge {
    @JavascriptInterface
    fun takeSharedText(): String {
      val text = pendingText ?: ""
      pendingText = null
      return text
    }

    @JavascriptInterface
    fun takeAction(): String {
      val action = pendingAction ?: ""
      pendingAction = null
      return action
    }

    @JavascriptInterface
    fun setDarkBars(dark: Boolean) {
      runOnUiThread {
        WindowCompat.getInsetsController(window, window.decorView).apply {
          isAppearanceLightStatusBars = !dark
          isAppearanceLightNavigationBars = !dark
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    readAction(intent)
    webView?.evaluateJavascript("window.__nativeAction?.()", null)
  }

  private fun readAction(intent: Intent?) {
    if (intent?.action == Intent.ACTION_SEND && intent.type?.startsWith("text/plain") == true) {
      val shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
      if (!shared.isNullOrBlank()) pendingText = shared
      intent.action = Intent.ACTION_MAIN
    }
    if (intent?.action == "dev.slothnote.app.NEW_NOTE") {
      pendingAction = "new-note"
      intent.action = Intent.ACTION_MAIN
    }
  }

  // Opens the system share sheet with plain text. Returns false when it cannot be opened.
  inner class ShareBridge {
    // Shares a UTF-8 .md file through a content URI (read-only grant). The shared folder
    // holds one file at a time and is emptied on every share and on startup.
    @JavascriptInterface
    fun shareFile(name: String?, text: String?): Boolean {
      val body = text ?: return false
      val safe = (name ?: "nota.md").replace(Regex("[\\/:*?\"<>|\u0000-\u001f]"), "_").take(120)
      val fileName = if (safe.contains(".")) safe else "$safe.md"
      val mime = if (fileName.endsWith(".json", ignoreCase = true)) "application/json" else "text/markdown"
      return try {
        val dir = File(cacheDir, "shared").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, fileName)
        file.writeText(body, Charsets.UTF_8)
        val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", file)
        runOnUiThread {
          try {
            val send = Intent(Intent.ACTION_SEND).apply {
              type = mime
              putExtra(Intent.EXTRA_STREAM, uri)
              putExtra(Intent.EXTRA_SUBJECT, fileName)
              clipData = ClipData.newRawUri(fileName, uri)
              addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(send, fileName))
          } catch (_: Exception) {
            webView?.evaluateJavascript("window.__shareFailed?.()", null)
          }
        }
        true
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun shareText(title: String?, text: String?): Boolean {
      val body = text ?: return false
      runOnUiThread {
        try {
          val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, body)
          }
          startActivity(Intent.createChooser(send, title))
        } catch (_: Exception) {
          webView?.evaluateJavascript("window.__shareFailed?.()", null)
        }
      }
      return true
    }
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
