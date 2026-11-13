package dev.slothnote.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.JavascriptInterface
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Sync secrets (ADR 0018). The value is encrypted with an AES key that never leaves the
 * Android Keystore; only the ciphertext is kept in private preferences. A backup restored
 * on another device cannot decrypt it, so the value reads as missing there.
 * Methods return "" for missing and "error" when the Keystore fails.
 */
class SecretsBridge(context: Context) {
  private val prefs = context.getSharedPreferences("sloth-secrets", Context.MODE_PRIVATE)
  private val names = setOf("sync")

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  @JavascriptInterface
  fun get(name: String): String {
    if (name !in names) return "error"
    val stored = prefs.getString(name, null) ?: return ""
    return try {
      val bytes = Base64.decode(stored, Base64.NO_WRAP)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
      String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)
    } catch (_: Exception) {
      // Restored from another device or Keystore reset: the old value is unreadable.
      prefs.edit().remove(name).apply()
      ""
    }
  }

  @JavascriptInterface
  fun set(name: String, value: String): String {
    if (name !in names) return "error"
    return try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key())
      val out = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
      if (prefs.edit().putString(name, Base64.encodeToString(out, Base64.NO_WRAP)).commit()) "ok" else "error"
    } catch (_: Exception) {
      "error"
    }
  }

  @JavascriptInterface
  fun delete(name: String): String {
    if (name !in names) return "error"
    return if (prefs.edit().remove(name).commit()) "ok" else "error"
  }

  private companion object {
    const val ALIAS = "sloth-sync-secrets"
  }
}
