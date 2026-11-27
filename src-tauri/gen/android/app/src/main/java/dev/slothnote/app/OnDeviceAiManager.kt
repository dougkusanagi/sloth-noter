package dev.slothnote.app

import android.content.Context
import com.google.mlkit.genai.common.DownloadCallback
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.proofreading.Proofreader
import com.google.mlkit.genai.proofreading.ProofreaderOptions
import com.google.mlkit.genai.proofreading.Proofreading
import com.google.mlkit.genai.proofreading.ProofreadingRequest
import com.google.mlkit.genai.summarization.Summarization
import com.google.mlkit.genai.summarization.SummarizationRequest
import com.google.mlkit.genai.summarization.Summarizer
import com.google.mlkit.genai.summarization.SummarizerOptions
import java.util.concurrent.Executors

/**
 * On-device ML Kit GenAI (Gemini Nano / AICore) manager for B7 (ADR 0047).
 * Checks real device availability asynchronously and runs summarization or proofreading locally.
 */
class OnDeviceAiManager(private val context: Context) {
  private val executor = Executors.newSingleThreadExecutor()
  @Volatile
  private var cachedState: String = "unavailable"
  private var summarizer: Summarizer? = null
  private var proofreader: Proofreader? = null

  fun currentState(): String = cachedState

  private fun getSummarizer(): Summarizer {
    val existing = summarizer
    if (existing != null) return existing
    val options = SummarizerOptions.builder(context)
      .setInputType(SummarizerOptions.InputType.ARTICLE)
      .setOutputType(SummarizerOptions.OutputType.THREE_BULLETS)
      .setLanguage(SummarizerOptions.Language.ENGLISH)
      .build()
    return Summarization.getClient(options).also { summarizer = it }
  }

  private fun getProofreader(): Proofreader {
    val existing = proofreader
    if (existing != null) return existing
    val options = ProofreaderOptions.builder(context)
      .setInputType(ProofreaderOptions.InputType.KEYBOARD)
      .setLanguage(ProofreaderOptions.Language.ENGLISH)
      .build()
    return Proofreading.getClient(options).also { proofreader = it }
  }

  fun refreshAvailability(onState: (String) -> Unit) {
    executor.execute {
      val nextState = try {
        val status = getSummarizer().checkFeatureStatus().get()
        if (status == FeatureStatus.AVAILABLE || status == FeatureStatus.DOWNLOADABLE) {
          "available"
        } else {
          "unavailable"
        }
      } catch (_: Throwable) {
        "unavailable"
      }
      cachedState = nextState
      onState(nextState)
    }
  }

  fun run(action: String, text: String, onDone: (ok: Boolean, result: String?, error: String?) -> Unit) {
    executor.execute {
      try {
        if (action == "summarize") {
          val client = getSummarizer()
          val status = client.checkFeatureStatus().get()
          if (status == FeatureStatus.DOWNLOADABLE) {
            downloadAndRun(
              startDownload = { cb -> client.downloadFeature(cb) },
              runWork = {
                val req = SummarizationRequest.builder(text).build()
                val res = client.runInference(req).get()
                onDone(true, res.summary, null)
              },
              onFail = { onDone(false, null, "unavailable") },
            )
            return@execute
          }
          if (status != FeatureStatus.AVAILABLE) {
            onDone(false, null, "unavailable")
            return@execute
          }
          val req = SummarizationRequest.builder(text).build()
          val res = client.runInference(req).get()
          onDone(true, res.summary, null)
        } else if (action == "proofread") {
          val client = getProofreader()
          val status = client.checkFeatureStatus().get()
          if (status == FeatureStatus.DOWNLOADABLE) {
            downloadAndRun(
              startDownload = { cb -> client.downloadFeature(cb) },
              runWork = {
                val req = ProofreadingRequest.builder(text).build()
                val res = client.runInference(req).get()
                val best = res.results.firstOrNull()?.text ?: text
                onDone(true, best, null)
              },
              onFail = { onDone(false, null, "unavailable") },
            )
            return@execute
          }
          if (status != FeatureStatus.AVAILABLE) {
            onDone(false, null, "unavailable")
            return@execute
          }
          val req = ProofreadingRequest.builder(text).build()
          val res = client.runInference(req).get()
          val best = res.results.firstOrNull()?.text ?: text
          onDone(true, best, null)
        } else {
          onDone(false, null, "invalid_action")
        }
      } catch (_: Throwable) {
        onDone(false, null, "failed")
      }
    }
  }

  private fun downloadAndRun(
    startDownload: (DownloadCallback) -> Unit,
    runWork: () -> Unit,
    onFail: () -> Unit,
  ) {
    startDownload(
      object : DownloadCallback {
        override fun onDownloadStarted(bytesToDownload: Long) {}
        override fun onDownloadProgress(totalBytesDownloaded: Long) {}
        override fun onDownloadCompleted() {
          executor.execute {
            try {
              runWork()
            } catch (_: Throwable) {
              onFail()
            }
          }
        }
        override fun onDownloadFailed(e: GenAiException) {
          onFail()
        }
      },
    )
  }

  fun close() {
    try {
      summarizer?.close()
    } catch (_: Throwable) {}
    try {
      proofreader?.close()
    } catch (_: Throwable) {}
    summarizer = null
    proofreader = null
    executor.shutdownNow()
  }
}
