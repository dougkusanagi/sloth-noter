package dev.slothnote.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * Private outbox (`filesDir/pending-notes/`) for notes captured from the lock screen.
 * Keeps QuickNoteActivity completely isolated from `state.v3.json` and avoids write races
 * with the Rust store lock while MainActivity may be running.
 */
object PendingNotesStore {
  const val MAX_CHARS = 1_000_000
  private const val DIR_NAME = "pending-notes"
  private val SAFE_ID = Regex("^[a-zA-Z0-9-]{1,64}$")

  enum class SaveResult {
    SAVED,
    EMPTY,
    TOO_LARGE,
    ERROR,
  }

  private fun dir(context: Context): File = File(context.filesDir, DIR_NAME)

  private fun isSafeId(id: String?): Boolean = !id.isNullOrBlank() && SAFE_ID.matches(id)

  @Synchronized
  fun save(context: Context, id: String, title: String, body: String, createdAt: Long): SaveResult {
    if (!isSafeId(id)) return SaveResult.ERROR
    if (title.isBlank() && body.isBlank()) {
      delete(context, id)
      return SaveResult.EMPTY
    }
    if (title.length + body.length > MAX_CHARS) return SaveResult.TOO_LARGE

    return try {
      val root = dir(context).apply { mkdirs() }
      val payload = JSONObject().apply {
        put("id", id)
        put("title", title)
        put("body", body)
        put("createdAt", createdAt)
      }.toString()
      val temporary = File(root, "$id.json.tmp")
      val destination = File(root, "$id.json")
      FileOutputStream(temporary).use { stream ->
        stream.write(payload.toByteArray(Charsets.UTF_8))
        stream.flush()
        stream.fd.sync()
      }
      if (!temporary.renameTo(destination)) {
        if (destination.exists() && destination.delete() && temporary.renameTo(destination)) {
          return SaveResult.SAVED
        }
        temporary.delete()
        return SaveResult.ERROR
      }
      SaveResult.SAVED
    } catch (_: Exception) {
      SaveResult.ERROR
    }
  }

  @Synchronized
  fun delete(context: Context, id: String): Boolean {
    if (!isSafeId(id)) return false
    val root = dir(context)
    if (!root.exists()) return true
    var ok = true
    for (name in listOf("$id.json", "$id.json.tmp")) {
      val file = File(root, name)
      if (file.exists() && !file.delete()) ok = false
    }
    return ok
  }

  @Synchronized
  fun listJson(context: Context): String {
    return try {
      val root = dir(context)
      if (!root.exists()) return "[]"
      val entries = mutableListOf<Pair<Long, JSONObject>>()
      val files = root.listFiles { file ->
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
          // Ignore malformed entry so other pending notes can still be imported.
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
  fun ackJson(context: Context, idsJson: String?): Boolean {
    if (idsJson.isNullOrBlank()) return false
    return try {
      val ids = JSONArray(idsJson)
      var allOk = true
      for (index in 0 until ids.length()) {
        val id = ids.optString(index, "")
        if (!delete(context, id)) allOk = false
      }
      allOk
    } catch (_: Exception) {
      false
    }
  }
}
