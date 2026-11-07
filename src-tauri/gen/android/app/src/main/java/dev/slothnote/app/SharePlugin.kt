package dev.slothnote.app

import android.app.Activity
import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class ShareTextArgs {
  lateinit var text: String
  lateinit var title: String
}

@TauriPlugin
class SharePlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun shareText(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(ShareTextArgs::class.java)
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, args.text)
        putExtra(Intent.EXTRA_SUBJECT, args.title)
      }
      activity.startActivity(Intent.createChooser(intent, null))
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Could not open sharing")
    }
  }

}
