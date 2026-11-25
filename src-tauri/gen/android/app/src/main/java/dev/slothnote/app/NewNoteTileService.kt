package dev.slothnote.app

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.TileService

/**
 * Quick Settings tile ("Nova nota", B3) that launches MainActivity with the existing
 * `dev.slothnote.app.NEW_NOTE` action, working whether the app is open or closed.
 */
class NewNoteTileService : TileService() {
  override fun onClick() {
    super.onClick()
    val intent = Intent(this, MainActivity::class.java).apply {
      action = "dev.slothnote.app.NEW_NOTE"
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val pending = PendingIntent.getActivity(
        this,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      startActivityAndCollapse(pending)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
