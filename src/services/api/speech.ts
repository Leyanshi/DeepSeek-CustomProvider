import { ApiError, request } from './client.js'
import { useSettings } from '../settings.js'
import { resolveServiceConnection } from './serviceConnection.js'
import type { AudioFormat } from './speechConfig.js'

/**
 * 语音接口：
 * - ASR：POST /v1/tools/asr，multipart 上传 WAV / Ogg Opus，一次返回全文
 * - TTS：POST /v1/tools/tts，返回音频字节流（产出首帧后即返回 200）
 * 鉴权都用 Authorization: Bearer。
 */

/** TTS 输出的裸 PCM 参数：24kHz、单声道、16-bit 小端 */
export const TTS_SAMPLE_RATE = 24000

/** 语音识别：audio 为 WAV（单声道 16-bit PCM）或 Ogg Opus，时长不超过 120 秒、大小不超过 8 MiB */
export const transcribe = async (audio: Blob, signal?: AbortSignal): Promise<string> => {
  const form = new FormData()
  form.append('file', audio, 'recording.wav')
  const settings = useSettings.getState()
  const config = settings.speech
  const connection = resolveServiceConnection(config.service, settings)
  if (config.protocol === 'openai') {
    form.append('model', config.asrModel)
    form.append('response_format', 'json')
  }
  const response = await request(
    config.protocol === 'openai' ? '/v1/audio/transcriptions' : '/v1/tools/asr',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${connection.apiKey}` },
      body: form,
      signal,
    },
    connection.baseUrl
  )
  const raw = await response.text()
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new ApiError('protocol', raw)
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    !('text' in body) ||
    typeof body.text !== 'string'
  ) {
    throw new ApiError('protocol', raw)
  }
  return body.text
}

/** 语音合成：返回裸 PCM 字节流；服务端默认过滤代码块、表格、引用标记与长公式 */
export const synthesize = async (
  text: string,
  signal: AbortSignal
): Promise<{ stream: ReadableStream<Uint8Array>; format: AudioFormat }> => {
  const settings = useSettings.getState()
  const config = settings.speech
  const connection = resolveServiceConnection(config.service, settings)
  const response = await request(
    config.protocol === 'openai' ? '/v1/audio/speech' : '/v1/tools/tts',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${connection.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        config.protocol === 'openai'
          ? {
              model: config.ttsModel,
              input: text,
              voice: config.voice,
              response_format: config.audioFormat,
            }
          : { text, voice_id: config.voice, format: config.audioFormat, filter_markdown: true }
      ),
      signal,
    },
    connection.baseUrl
  )
  const contentType = (response.headers.get('Content-Type') ?? '').toLowerCase()
  if (contentType.includes('json') || contentType.startsWith('text/')) {
    throw new ApiError('protocol', await response.text())
  }
  if (!response.body) {
    throw new ApiError('protocol', await response.text())
  }
  const format = /wav|wave/.test(contentType)
    ? 'wav'
    : /mpeg|mp3/.test(contentType)
      ? 'mp3'
      : /pcm|l16/.test(contentType)
        ? 'pcm'
        : config.audioFormat
  return { stream: response.body, format }
}
