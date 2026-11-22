import { normalizeModelId } from './models.js'
import {
  EMPTY_SERVICE,
  normalizeServiceConnection,
  type ServiceConnection,
} from './serviceConnection.js'

export type SpeechProtocol = 'deepseek' | 'openai'
export type AudioFormat = 'pcm' | 'wav' | 'mp3'
export type SpeechConfig = {
  service: ServiceConnection
  protocol: SpeechProtocol
  ttsModel: string
  asrModel: string
  voice: string
  audioFormat: AudioFormat
}

export const defaultSpeechConfig = (voice = 'stella'): SpeechConfig => ({
  service: { ...EMPTY_SERVICE },
  protocol: 'deepseek',
  ttsModel: 'tts-1',
  asrModel: 'whisper-1',
  voice: voice === 'tide' ? 'tide' : 'stella',
  audioFormat: 'pcm',
})

export const normalizeSpeechConfig = (config: SpeechConfig): SpeechConfig => {
  const service = normalizeServiceConnection(config.service)
  if (
    !['deepseek', 'openai'].includes(config.protocol) ||
    !['pcm', 'wav', 'mp3'].includes(config.audioFormat)
  ) {
    throw new Error('Invalid speech format')
  }
  const voice = config.voice.trim()
  if (
    !voice ||
    voice.length > 256 ||
    (config.protocol === 'deepseek' && !['stella', 'tide'].includes(voice))
  ) {
    throw new Error('Invalid voice ID')
  }
  return {
    ...config,
    service,
    voice,
    ttsModel: normalizeModelId(config.ttsModel),
    asrModel: normalizeModelId(config.asrModel),
    audioFormat:
      config.protocol === 'deepseek' && config.audioFormat === 'mp3' ? 'wav' : config.audioFormat,
  }
}
