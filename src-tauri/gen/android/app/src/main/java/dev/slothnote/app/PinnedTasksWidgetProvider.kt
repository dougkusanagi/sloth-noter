package dev.slothnote.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.view.View
import android.widget.RemoteViews

/**
 * Home-screen widget showing tasks from a pinned note (B5, ADR 0046).
 * Tapping a task toggles it immediately via `WidgetTasksStore` without opening the app.
 * Tapping the header opens the note in `MainActivity`.
 */
class PinnedTasksWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    for (widgetId in appWidgetIds) {
      updateWidget(context, appWidgetManager, widgetId)
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_TOGGLE_TASK) {
      val noteId = intent.getStringExtra(EXTRA_NOTE_ID) ?: return
      val line = intent.getIntExtra(EXTRA_TASK_LINE, -1)
      if (line <= 0) return
      if (WidgetTasksStore.toggleTask(context, noteId, line)) {
        updateAll(context)
        MainActivity.notifyNativeAction()
      }
    }
  }

  companion object {
    const val ACTION_TOGGLE_TASK = "dev.slothnote.app.WIDGET_TOGGLE_TASK"
    const val ACTION_OPEN_NOTE = "dev.slothnote.app.OPEN_NOTE"
    const val EXTRA_NOTE_ID = "dev.slothnote.app.EXTRA_NOTE_ID"
    const val EXTRA_TASK_LINE = "dev.slothnote.app.EXTRA_TASK_LINE"

    private val ROW_IDS = intArrayOf(
      R.id.widget_task_0,
      R.id.widget_task_1,
      R.id.widget_task_2,
      R.id.widget_task_3,
      R.id.widget_task_4,
      R.id.widget_task_5,
      R.id.widget_task_6,
      R.id.widget_task_7,
    )

    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context) ?: return
      val component = ComponentName(context, PinnedTasksWidgetProvider::class.java)
      val ids = manager.getAppWidgetIds(component)
      if (ids.isEmpty()) return
      for (id in ids) {
        updateWidget(context, manager, id)
      }
    }

    private fun updateWidget(
      context: Context,
      manager: AppWidgetManager,
      widgetId: Int,
    ) {
      val snapshot = WidgetTasksStore.readSnapshot(context)
      val views = RemoteViews(context.packageName, R.layout.widget_pinned_tasks)

      val titleText =
        if (snapshot.noteId != null) {
          snapshot.title.ifBlank { context.getString(R.string.app_name) }
        } else {
          context.getString(R.string.widget_pinned_tasks_title)
        }
      views.setTextViewText(R.id.widget_title, titleText)

      val openIntent = Intent(context, MainActivity::class.java).apply {
        if (snapshot.noteId != null) {
          action = ACTION_OPEN_NOTE
          putExtra(EXTRA_NOTE_ID, snapshot.noteId)
        }
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      val openPending = PendingIntent.getActivity(
        context,
        widgetId * 100,
        openIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      views.setOnClickPendingIntent(R.id.widget_header, openPending)

      if (snapshot.tasks.isEmpty()) {
        val emptyMessage =
          if (snapshot.noteId == null) {
            context.getString(R.string.widget_pinned_tasks_empty_no_pinned)
          } else {
            context.getString(R.string.widget_pinned_tasks_empty_no_tasks)
          }
        views.setTextViewText(R.id.widget_empty, emptyMessage)
        views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
        for (rowId in ROW_IDS) {
          views.setViewVisibility(rowId, View.GONE)
        }
      } else {
        views.setViewVisibility(R.id.widget_empty, View.GONE)
        val noteId = snapshot.noteId ?: ""
        ROW_IDS.forEachIndexed { index, rowId ->
          val task = snapshot.tasks.getOrNull(index)
          if (task == null) {
            views.setViewVisibility(rowId, View.GONE)
          } else {
            views.setViewVisibility(rowId, View.VISIBLE)
            val prefix = if (task.done) "☑ " else "☐ "
            views.setTextViewText(rowId, prefix + task.text)
            val flags =
              if (task.done) {
                Paint.ANTI_ALIAS_FLAG or Paint.STRIKE_THRU_TEXT_FLAG
              } else {
                Paint.ANTI_ALIAS_FLAG
              }
            views.setInt(rowId, "setPaintFlags", flags)

            val toggleIntent = Intent(context, PinnedTasksWidgetProvider::class.java).apply {
              action = ACTION_TOGGLE_TASK
              putExtra(EXTRA_NOTE_ID, noteId)
              putExtra(EXTRA_TASK_LINE, task.line)
            }
            val togglePending = PendingIntent.getBroadcast(
              context,
              widgetId * 100 + index + 1,
              toggleIntent,
              PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(rowId, togglePending)
          }
        }
      }

      manager.updateAppWidget(widgetId, views)
    }
  }
}
