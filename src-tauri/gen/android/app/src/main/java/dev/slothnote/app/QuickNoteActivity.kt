package dev.slothnote.app

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.util.UUID

/**
 * Isolated entry point for `android.intent.action.CREATE_NOTE` (ROLE_NOTES, Android 14+).
 * When unlocked, delegates immediately to MainActivity (`NEW_NOTE`) and finishes.
 * When locked, renders a blank native composer without reading or exposing existing notes.
 */
class QuickNoteActivity : AppCompatActivity() {
  private var sessionId: String = ""
  private var createdAt: Long = 0L
  private var savedExplicitly = false
  private var discarded = false
  private lateinit var titleInput: EditText
  private lateinit var bodyInput: EditText
  private lateinit var keyguardManager: KeyguardManager

  override fun onCreate(savedInstanceState: Bundle?) {
    keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager

    // When the device is already unlocked, go straight to the full editor in MainActivity.
    if (savedInstanceState == null && !keyguardManager.isKeyguardLocked) {
      super.onCreate(null)
      openMainActivity(openNewNote = true)
      return
    }

    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }

    sessionId = savedInstanceState?.getString(STATE_SESSION_ID) ?: UUID.randomUUID().toString()
    createdAt = savedInstanceState?.getLong(STATE_CREATED_AT) ?: System.currentTimeMillis()

    val isDark =
      (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES
    val bgColor = Color.parseColor(if (isDark) "#171715" else "#F7F6F2")
    val inkColor = Color.parseColor(if (isDark) "#ECE9E2" else "#23221E")
    val mutedColor = Color.parseColor(if (isDark) "#AAA69D" else "#67645D")
    val noticeBgColor = Color.parseColor(if (isDark) "#2B2B27" else "#F1EFE8")
    val accentColor = Color.parseColor(if (isDark) "#E2A074" else "#A65427")
    val onAccentColor = Color.parseColor(if (isDark) "#1D140D" else "#FFFFFF")
    val edgeColor = Color.parseColor(if (isDark) "#22FFFFFF" else "#1F23221E")

    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = !isDark
      isAppearanceLightNavigationBars = !isDark
    }

    fun dp(value: Int): Int =
      TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        resources.displayMetrics,
      ).toInt()

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(bgColor)
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      )
    }

    val topBar = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      minimumHeight = dp(56)
      setPadding(dp(12), dp(8), dp(12), dp(8))
    }

    val discardButton = Button(this, null, android.R.attr.borderlessButtonStyle).apply {
      text = getString(R.string.quick_note_discard)
      setTextColor(mutedColor)
      isAllCaps = false
      minimumHeight = dp(48)
      minimumWidth = dp(48)
      setOnClickListener {
        discarded = true
        PendingNotesStore.delete(applicationContext, sessionId)
        finish()
      }
    }

    val headerTitle = TextView(this).apply {
      text = getString(R.string.quick_note_label)
      setTextColor(inkColor)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    }

    val saveBackground = GradientDrawable().apply {
      setColor(accentColor)
      cornerRadius = dp(10).toFloat()
    }
    val saveButton = Button(this).apply {
      text = getString(R.string.quick_note_save)
      setTextColor(onAccentColor)
      background = saveBackground
      isAllCaps = false
      minimumHeight = dp(48)
      minimumWidth = dp(72)
      setPadding(dp(16), 0, dp(16), 0)
      setOnClickListener { saveAndClose() }
    }

    topBar.addView(discardButton)
    topBar.addView(headerTitle)
    topBar.addView(saveButton)

    val noticeBackground = GradientDrawable().apply {
      setColor(noticeBgColor)
      cornerRadius = dp(8).toFloat()
      setStroke(dp(1), edgeColor)
    }
    val privacyNotice = TextView(this).apply {
      text = getString(R.string.quick_note_locked_notice)
      setTextColor(mutedColor)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      background = noticeBackground
      setPadding(dp(12), dp(10), dp(12), dp(10))
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
      ).apply {
        setMargins(dp(16), dp(4), dp(16), dp(8))
      }
    }

    titleInput = EditText(this).apply {
      hint = getString(R.string.quick_note_title_hint)
      setTextColor(inkColor)
      setHintTextColor(mutedColor)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      background = null
      isSingleLine = true
      imeOptions = EditorInfo.IME_ACTION_NEXT
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
      minimumHeight = dp(48)
      setPadding(dp(16), dp(12), dp(16), dp(8))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        isAutoHandwritingEnabled = true
      }
    }

    bodyInput = EditText(this).apply {
      hint = getString(R.string.quick_note_body_hint)
      setTextColor(inkColor)
      setHintTextColor(mutedColor)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      background = null
      gravity = Gravity.TOP or Gravity.START
      inputType =
        InputType.TYPE_CLASS_TEXT or
          InputType.TYPE_TEXT_FLAG_MULTI_LINE or
          InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
      minHeight = dp(200)
      setPadding(dp(16), dp(8), dp(16), dp(16))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        isAutoHandwritingEnabled = true
      }
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      )
    }

    val editorColumn = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      addView(titleInput)
      addView(bodyInput)
    }

    val scroll = ScrollView(this).apply {
      isFillViewport = true
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        0,
        1f,
      )
      addView(editorColumn)
    }

    val footer = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.END or Gravity.CENTER_VERTICAL
      setPadding(dp(16), dp(8), dp(16), dp(12))
    }

    val unlockButton = Button(this, null, android.R.attr.borderlessButtonStyle).apply {
      text = getString(R.string.quick_note_unlock_open)
      setTextColor(accentColor)
      isAllCaps = false
      minimumHeight = dp(48)
      setOnClickListener { unlockAndOpen() }
    }
    footer.addView(unlockButton)

    root.addView(topBar)
    root.addView(privacyNotice)
    root.addView(scroll)
    root.addView(footer)

    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime(),
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }

    setContentView(root)

    bodyInput.requestFocus()
    val useStylus = intent?.getBooleanExtra(EXTRA_USE_STYLUS_MODE, false) == true
    if (!useStylus) {
      bodyInput.post {
        WindowInsetsControllerCompat(window, bodyInput).show(WindowInsetsCompat.Type.ime())
      }
    }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    outState.putString(STATE_SESSION_ID, sessionId)
    outState.putLong(STATE_CREATED_AT, createdAt)
  }

  override fun onStop() {
    super.onStop()
    if (!discarded && !savedExplicitly && !isChangingConfigurations) {
      val title = titleInput.text?.toString() ?: ""
      val body = bodyInput.text?.toString() ?: ""
      if (title.isNotBlank() || body.isNotBlank()) {
        PendingNotesStore.save(applicationContext, sessionId, title, body, createdAt)
      }
    }
  }

  private fun saveCurrentDraft(): PendingNotesStore.SaveResult {
    val title = titleInput.text?.toString() ?: ""
    val body = bodyInput.text?.toString() ?: ""
    return PendingNotesStore.save(applicationContext, sessionId, title, body, createdAt)
  }

  private fun saveAndClose() {
    when (saveCurrentDraft()) {
      PendingNotesStore.SaveResult.SAVED -> {
        savedExplicitly = true
        Toast.makeText(this, R.string.quick_note_saved_toast, Toast.LENGTH_SHORT).show()
        finish()
      }
      PendingNotesStore.SaveResult.EMPTY -> {
        savedExplicitly = true
        Toast.makeText(this, R.string.quick_note_empty_toast, Toast.LENGTH_SHORT).show()
        finish()
      }
      PendingNotesStore.SaveResult.TOO_LARGE -> {
        Toast.makeText(this, R.string.quick_note_too_large_toast, Toast.LENGTH_SHORT).show()
      }
      PendingNotesStore.SaveResult.ERROR -> {
        Toast.makeText(this, R.string.quick_note_save_failed_toast, Toast.LENGTH_SHORT).show()
      }
    }
  }

  private fun unlockAndOpen() {
    val result = saveCurrentDraft()
    if (result == PendingNotesStore.SaveResult.TOO_LARGE) {
      Toast.makeText(this, R.string.quick_note_too_large_toast, Toast.LENGTH_SHORT).show()
      return
    }
    if (result == PendingNotesStore.SaveResult.ERROR) {
      Toast.makeText(this, R.string.quick_note_save_failed_toast, Toast.LENGTH_SHORT).show()
      return
    }
    if (result == PendingNotesStore.SaveResult.SAVED) {
      savedExplicitly = true
    }
    val openNewNote = result == PendingNotesStore.SaveResult.EMPTY
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && keyguardManager.isKeyguardLocked) {
      keyguardManager.requestDismissKeyguard(
        this,
        object : KeyguardManager.KeyguardDismissCallback() {
          override fun onDismissSucceeded() {
            openMainActivity(openNewNote = openNewNote)
          }
        },
      )
      return
    }
    openMainActivity(openNewNote = openNewNote)
  }

  private fun openMainActivity(openNewNote: Boolean) {
    val mainIntent = Intent(this, MainActivity::class.java).apply {
      if (openNewNote) action = ACTION_NEW_NOTE
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    startActivity(mainIntent)
    finish()
  }

  companion object {
    private const val ACTION_NEW_NOTE = "dev.slothnote.app.NEW_NOTE"
    private const val EXTRA_USE_STYLUS_MODE = "android.intent.extra.USE_STYLUS_MODE"
    private const val STATE_SESSION_ID = "quick_note_session_id"
    private const val STATE_CREATED_AT = "quick_note_created_at"
  }
}
