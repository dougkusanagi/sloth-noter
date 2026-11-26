package dev.slothnote.app

import android.app.role.RoleManager
import android.content.ClipData
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.view.View
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.activity.OnBackPressedCallback
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  // One-shot action from a launcher shortcut. The web layer takes it once, so a repeated
  // intent (rotation, resume) never creates a second note.
  private var pendingAction: String? = null
  private var pendingText: String? = null
  private var pendingOpenNoteId: String? = null
  private var webView: WebView? = null
  private var backEnabled = true
  private var backCallback: OnBackPressedCallback? = null
  private var imeHeight = 0
  private var keyboard = "closed"
  private var animating = false
  private var lastInsets: WindowInsetsCompat? = null
  private var pendingFile: Pair<Int, String>? = null
  private val createFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    val pending = pendingFile
    pendingFile = null
    if (pending != null) {
      val uri = result.data?.data
      if (result.resultCode != RESULT_OK || uri == null) {
        reportFileResult(pending.first, "cancelled")
      } else {
        Thread {
          val status = try {
            val stream = contentResolver.openOutputStream(uri, "wt") ?: error("No output stream")
            stream.bufferedWriter(Charsets.UTF_8).use { it.write(pending.second) }
            "saved"
          } catch (_: Exception) {
            "error"
          }
          runOnUiThread { reportFileResult(pending.first, status) }
        }.start()
      }
    }
  }

  private val requestNotesRoleLauncher =
    registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
      webView?.evaluateJavascript("window.__slothNotesRoleChanged?.('${notesRoleState()}')", null)
    }

  private fun notesRoleState(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return "unavailable"
    val roleManager = getSystemService(RoleManager::class.java) ?: return "unavailable"
    if (!roleManager.isRoleAvailable(RoleManager.ROLE_NOTES)) return "unavailable"
    return if (roleManager.isRoleHeld(RoleManager.ROLE_NOTES)) "held" else "available"
  }

  private fun reportFileResult(id: Int, status: String) {
    webView?.evaluateJavascript("window.__slothFileResult?.($id,'$status')", null)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      webView.isAutoHandwritingEnabled = true
    }
    webView.addJavascriptInterface(ShareBridge(), "SlothShare")
    webView.addJavascriptInterface(SystemBridge(), "SlothSystem")
    webView.addJavascriptInterface(SecretsBridge(applicationContext), "SlothSecrets")
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    activeInstance = java.lang.ref.WeakReference(this)
    if (savedInstanceState == null) readAction(intent)
    File(cacheDir, "shared").listFiles()?.forEach { it.delete() }
    // Enabled until the web layer reports otherwise, and disabled at the root so Android can
    // show its predictive-back preview. The web layer enables it again while a sheet, screen
    // or unsaved note needs to be closed first.
    val callback = object : OnBackPressedCallback(backEnabled) {
      override fun handleOnBackPressed() {
        val view = webView
        if (view == null) {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          return
        }
        view.evaluateJavascript("Boolean(window.__slothMobileBack?.())") { handled ->
          if (handled != "true") {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = backEnabled
          }
        }
      }
    }
    backCallback = callback
    onBackPressedDispatcher.addCallback(this, callback)
    val content = findViewById<View>(android.R.id.content)
    // The WebView is not padded: its background stays the app's. CSS reads these values
    // (public/insets-boot.js) and pads only the mobile shell.
    ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
      lastInsets = insets
      imeHeight = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      if (!animating) keyboard = if (insets.isVisible(WindowInsetsCompat.Type.ime())) "open" else "closed"
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
    fun setBackEnabled(enabled: Boolean) {
      runOnUiThread {
        backEnabled = enabled
        backCallback?.isEnabled = enabled
      }
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

    @JavascriptInterface
    fun takePendingNotes(): String = PendingNotesStore.listJson(applicationContext)

    @JavascriptInterface
    fun ackPendingNotes(idsJson: String?): Boolean =
      PendingNotesStore.ackJson(applicationContext, idsJson)

    @JavascriptInterface
    fun takeOpenNoteId(): String {
      val id = pendingOpenNoteId ?: ""
      pendingOpenNoteId = null
      return id
    }

    @JavascriptInterface
    fun syncWidgetSnapshot(json: String?): Boolean {
      val saved = WidgetTasksStore.saveSnapshotJson(applicationContext, json)
      if (saved) PinnedTasksWidgetProvider.updateAll(applicationContext)
      return saved
    }

    @JavascriptInterface
    fun takePendingWidgetToggles(): String =
      WidgetTasksStore.listPendingTogglesJson(applicationContext)

    @JavascriptInterface
    fun ackPendingWidgetToggles(idsJson: String?): Boolean =
      WidgetTasksStore.ackPendingTogglesJson(applicationContext, idsJson)

    @JavascriptInterface
    fun getNotesRoleState(): String = notesRoleState()

    @JavascriptInterface
    fun isStylusHandwritingSupported(): Boolean =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE

    @JavascriptInterface
    fun getOnDeviceAiState(): String = "unavailable"

    @JavascriptInterface
    fun runOnDeviceAi(requestId: Int, action: String?, text: String?): Boolean {
      runOnUiThread {
        webView?.evaluateJavascript(
          "window.__slothAiResult?.($requestId,'{\"ok\":false,\"error\":\"unavailable\"}')",
          null,
        )
      }
      return true
    }

    @JavascriptInterface
    fun requestNotesRole(): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return false
      val roleManager = getSystemService(RoleManager::class.java) ?: return false
      if (!roleManager.isRoleAvailable(RoleManager.ROLE_NOTES)) return false
      if (roleManager.isRoleHeld(RoleManager.ROLE_NOTES)) {
        runOnUiThread {
          webView?.evaluateJavascript("window.__slothNotesRoleChanged?.('held')", null)
        }
        return true
      }
      val intent = try {
        roleManager.createRequestRoleIntent(RoleManager.ROLE_NOTES)
      } catch (_: Exception) {
        return false
      }
      runOnUiThread {
        try {
          requestNotesRoleLauncher.launch(intent)
        } catch (_: Exception) {
          webView?.evaluateJavascript("window.__slothNotesRoleChanged?.('${notesRoleState()}')", null)
        }
      }
      return true
    }
  }

  override fun onResume() {
    super.onResume()
    webView?.evaluateJavascript("window.__nativeAction?.()", null)
    webView?.evaluateJavascript("window.__slothNotesRoleChanged?.('${notesRoleState()}')", null)
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
    if (intent?.action == PinnedTasksWidgetProvider.ACTION_OPEN_NOTE) {
      val id = intent.getStringExtra(PinnedTasksWidgetProvider.EXTRA_NOTE_ID)
      if (!id.isNullOrBlank()) pendingOpenNoteId = id
      intent.action = Intent.ACTION_MAIN
    }
  }

  // Opens the system share sheet with plain text. Returns false when it cannot be opened.
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
        lastInsets = insets
        imeHeight = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
        publish(insets, ime.interpolatedFraction)
        return insets
      }

      override fun onEnd(animation: WindowInsetsAnimationCompat) {
        if ((animation.typeMask and WindowInsetsCompat.Type.ime()) != 0) {
          animating = false
          lastInsets?.let { insets ->
            imeHeight = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            keyboard = if (insets.isVisible(WindowInsetsCompat.Type.ime())) "open" else "closed"
            publish(insets, 1f)
          }
        }
      }
    }

  // Only sends text selected by the user to Android's chooser. No files or permissions are exposed.
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
    fun requestInsets() {
      runOnUiThread {
        val content = findViewById<View>(android.R.id.content)
        ViewCompat.requestApplyInsets(content)
      }
    }

    @JavascriptInterface
    fun hideKeyboard() {
      runOnUiThread {
        val content = findViewById<View>(android.R.id.content)
        WindowInsetsControllerCompat(window, content).hide(WindowInsetsCompat.Type.ime())
      }
    }

    @JavascriptInterface
    fun haptic(kind: String) {
      runOnUiThread {
        val code = when (kind) {
          "heading" -> android.view.HapticFeedbackConstants.CLOCK_TICK
          "task-done", "threshold" ->
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R)
              android.view.HapticFeedbackConstants.CONFIRM
            else
              android.view.HapticFeedbackConstants.KEYBOARD_TAP
          else -> return@runOnUiThread
        }
        webView?.performHapticFeedback(code)
      }
    }

    @JavascriptInterface
    fun finishActivity() {
      runOnUiThread { finish() }
    }

    @JavascriptInterface
    fun saveText(name: String, mime: String, text: String, requestId: Int) {
      runOnUiThread {
        if (pendingFile != null) {
          reportFileResult(requestId, "error")
        } else {
          try {
            pendingFile = Pair(requestId, text)
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
              addCategory(Intent.CATEGORY_OPENABLE)
              type = mime
              putExtra(Intent.EXTRA_TITLE, name)
            }
            createFile.launch(intent)
          } catch (_: Exception) {
            pendingFile = null
            reportFileResult(requestId, "error")
          }
        }
      }
    }

    @JavascriptInterface
    fun shareText(text: String, requestId: Int) {
      runOnUiThread {
        val success = try {
          val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
          }
          startActivity(Intent.createChooser(intent, null))
          true
        } catch (_: Exception) {
          false
        }
        webView?.evaluateJavascript("window.__slothShareResult?.($requestId,$success)", null)
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

  override fun onDestroy() {
    if (activeInstance?.get() === this) activeInstance = null
    super.onDestroy()
  }

  companion object {
    @Volatile
    private var activeInstance: java.lang.ref.WeakReference<MainActivity>? = null

    fun notifyNativeAction() {
      val activity = activeInstance?.get() ?: return
      activity.runOnUiThread {
        activity.webView?.evaluateJavascript("window.__nativeAction?.()", null)
      }
    }
  }
}
