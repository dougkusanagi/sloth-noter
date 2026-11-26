package dev.slothnote.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/**
 * Private storage (`filesDir/widget/`) for the pinned-tasks home-screen widget (ADR 0046).
 * Keeps widget reads and toggles decoupled from `state.v3.json` so there are never write races
 * with the main WebView/Rust store.
 */
object WidgetTasksStore {
  private const val ROOT_DIR = "widget"
  private const val SNAPSHOT_FILE = "pinned-tasks.json"
  private const val PENDING_DIR = "pending-toggles"
  private val SAFE_ID = Regex("^[a-zA-Z0-9-]{1,64}$")

  data class WidgetTask(
    val line: Int,
    val status: String,
    val done: Boolean,
    val text: String,
  )

  data class WidgetSnapshot(
    val noteId: String?,
    val title: String,
    val tasks: List<WidgetTask>,
    val totalCount: Int,
  )

  private fun rootDir(context: Context): File = File(context.filesDir, ROOT_DIR)

  private fun pendingDir(context: Context): File = File(rootDir(context), PENDING_DIR)

  private fun snapshotFile(context: Context): File = File(rootDir(context), SNAPSHOT_FILE)

  private fun isSafeId(id: String?): Boolean = !id.isNullOrBlank() && SAFE_ID.matches(id)

  private fun atomicWrite(destination: File, content: String): Boolean {
    return try {
      destination.parentFile?.mkdirs()
      val temporary = File(destination.parentFile, "${destination.name}.tmp")
      FileOutputStream(temporary).use { stream ->
        stream.write(content.toByteArray(Charsets.UTF_8))
        stream.flush()
        stream.fd.sync()
      }
      if (!temporary.renameTo(destination)) {
        if (destination.exists() && destination.delete() && temporary.renameTo(destination)) {
          return true
        }
        temporary.delete()
        return false
      }
      true
    } catch (_: Exception) {
      false
    }
  }

  @Synchronized
  fun saveSnapshotJson(context: Context, json: String?): Boolean {
    if (json.isNullOrBlank()) return false
    return try {
      // Validate JSON before saving.
      JSONObject(json)
      atomicWrite(snapshotFile(context), json)
    } catch (_: Exception) {
      false
    }
  }

  @Synchronized
  fun readSnapshot(context: Context): WidgetSnapshot {
    val empty = WidgetSnapshot(noteId = null, title = "", tasks = emptyList(), totalCount = 0)
    val file = snapshotFile(context)
    if (!file.exists()) return empty
    return try {
      val obj = JSONObject(file.readText(Charsets.UTF_8))
      val noteId = if (obj.isNull("noteId")) null else obj.optString("noteId", "").ifBlank { null }
      val title = obj.optString("title", "")
      val totalCount = obj.optInt("totalCount", 0)
      val arr = obj.optJSONArray("tasks") ?: JSONArray()
      val tasks = mutableListOf<WidgetTask>()
      for (i in 0 until arr.length()) {
        val item = arr.optJSONObject(i) ?: continue
        val line = item.optInt("line", -1)
        if (line <= 0) continue
        val done = item.optBoolean("done", false)
        val status = item.optString("status", if (done) "done" else "todo")
        val text = item.optString("text", "")
        tasks.add(WidgetTask(line = line, status = status, done = done, text = text))
      }
      WidgetSnapshot(noteId = noteId, title = title, tasks = tasks, totalCount = totalCount)
    } catch (_: Exception) {
      empty
    }
  }

  /**
   * Flips a task in the local widget snapshot for immediate visual feedback and enqueues an
   * idempotent toggle for the main app to apply via `tasks.js`.
   */
  @Synchronized
  fun toggleTask(context: Context, noteId: String, line: Int): Boolean {
    if (noteId.isBlank() || line <= 0) return false
    val current = readSnapshot(context)
    if (current.noteId != noteId) return false
    val index = current.tasks.indexOfFirst { it.line == line }
    if (index < 0) return false

    val task = current.tasks[index]
    val nextDone = !task.done
    val targetStatus = if (nextDone) "done" else "todo"

    // 1. Update local snapshot immediately.
    val updatedTasks = JSONArray()
    current.tasks.forEachIndexed { i, item ->
      val isTarget = i == index
      updatedTasks.put(
        JSONObject().apply {
          put("line", item.line)
          put("status", if (isTarget) targetStatus else item.status)
          put("done", if (isTarget) nextDone else item.done)
          put("text", item.text)
        },
      )
    }
    val nextSnapshot = JSONObject().apply {
      put("noteId", current.noteId)
      put("title", current.title)
      put("totalCount", current.totalCount)
      put("tasks", updatedTasks)
    }.toString()
    atomicWrite(snapshotFile(context), nextSnapshot)

    // 2. Enqueue pending toggle for MainActivity / tasks.js.
    val toggleId = UUID.randomUUID().toString()
    val payload = JSONObject().apply {
      put("id", toggleId)
      put("noteId", noteId)
      put("line", line)
      put("text", task.text)
      put("targetStatus", targetStatus)
      put("createdAt", System.currentTimeMillis())
    }.toString()
    return atomicWrite(File(pendingDir(context), "$toggleId.json"), payload)
  }

  @Synchronized
  fun listPendingTogglesJson(context: Context): String {
    return try {
      val dir = pendingDir(context)
      if (!dir.exists()) return "[]"
      val entries = mutableListOf<Pair<Long, JSONObject>>()
      val files = dir.listFiles { file ->
        file.isFile && file.name.endsWith(".json") && !file.name.endsWith(".json.tmp")
      } ?: return "[]"
      for (file in files) {
        try {
          val obj = JSONObject(file.readText(Charsets.UTF_8))
          val id = obj.optString("id", "")
          if (!isSafeId(id)) continue
          val createdAt = obj.optLong("createdAt", file.lastModified())
          entries.add(createdAt to obj)
        } catch (_: Exception) {
          // Ignore malformed entry.
        }
      }
      entries.sortBy { it.first }
      val result = JSONArray()
      for ((_, obj) in entries) result.put(obj)
      result.toString()
    } catch (_: Exception) {
      "[]"
    }
  }

  @Synchronized
  fun ackPendingTogglesJson(context: Context, idsJson: String?): Boolean {
    if (idsJson.isNullOrBlank()) return false
    return try {
      val ids = JSONArray(idsJson)
      val dir = pendingDir(context)
      if (!dir.exists()) return true
      var allOk = true
      for (i in 0 until ids.length()) {
        val id = ids.optString(i, "")
        if (!isSafeId(id)) {
          allOk = false
          continue
        }
        for (name in listOf("$id.json", "$id.json.tmp")) {
          val file = File(dir, name)
          if (file.exists() && !file.delete()) allOk = false
        }
      }
      allOk
    } catch (_: Exception) {
      false
    }
  }
}
