package dev.slothnote.app

import android.app.KeyguardManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Quick Settings tile ("Nova nota", B3/B4): opens the isolated lock-screen composer
 * (`QuickNoteActivity`) when the device is locked so existing notes remain protected,
 * and opens `MainActivity` with `dev.slothnote.app.NEW_NOTE` when unlocked.
 */
class NewNoteTileService : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      updateTile()
    }
  }

  override fun onClick() {
    super.onClick()
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    val isLocked = keyguard?.isKeyguardLocked == true
    val (intent, requestCode) =
      if (isLocked) {
        Intent(this, QuickNoteActivity::class.java).apply {
          action = "android.intent.action.CREATE_NOTE"
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        } to 1
      } else {
        Intent(this, MainActivity::class.java).apply {
          action = "dev.slothnote.app.NEW_NOTE"
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        } to 0
      }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val pending = PendingIntent.getActivity(
        this,
        requestCode,
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
