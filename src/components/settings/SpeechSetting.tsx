import { useEffect, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { fetchModels } from '../../services/api/client.js'
import type { ApiModel } from '../../services/api/models.js'
import {
  normalizeSpeechConfig,
  type AudioFormat,
  type SpeechProtocol,
} from '../../services/api/speechConfig.js'
import { resolveServiceConnection } from '../../services/api/serviceConnection.js'
import { setSpeechSettings, useSettings } from '../../services/settings.js'
import {
  describeReadAloudError,
  stopReadAloud,
  toggleReadAloud,
} from '../../services/speech/readAloud.js'
import { Button } from '../base/Button.js'
import { showToast } from '../base/toastState.js'
import { ServiceFields } from './ServiceFields.js'
import styles from './Settings.module.css'

export const SpeechSetting = () => {
  const t = useTranslate()
  const [config, setConfig] = useState(useSettings.getState().speech)
  const [custom, setCustom] = useState(Boolean(config.service.baseUrl))
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<ApiModel[]>([])
  const [loading, setLoading] = useState(false)
  const active = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      active.current?.abort()
      stopReadAloud()
    },
    []
  )
  const loadModels = async () => {
    if (active.current) {
      return
    }
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 25000)
    setLoading(true)
    setError(null)
    try {
      const connection = resolveServiceConnection(
        custom ? config.service : { baseUrl: '', apiKey: '' },
        useSettings.getState()
      )
      const catalog = await fetchModels(connection.apiKey, controller.signal, connection.baseUrl)
      setModels(catalog)
    } catch (cause) {
      if (active.current === controller) {
        setError(
          t('modelsFetchFailed', {
            message: cause instanceof Error ? cause.message : String(cause),
          })
        )
      }
    } finally {
      clearTimeout(timeout)
      active.current = null
      setLoading(false)
    }
  }
  return (
    <section aria-label={t('speechServiceTitle')} className={styles.cell}>
      <div className={styles.label}>{t('speechServiceTitle')}</div>
      <p className={styles.description}>{t('speechServiceDescription')}</p>
      <label className={styles.label} htmlFor="speech-service-source">
        {t('speechServiceSource')}
      </label>
      <select
        id="speech-service-source"
        className={styles.serviceSelect}
        value={custom ? 'custom' : 'chat'}
        onChange={(event) => {
          setCustom(event.target.value === 'custom')
          setError(null)
          setModels([])
        }}
      >
        <option value="chat">{t('serviceFollowChat')}</option>
        <option value="custom">{t('serviceIndependent')}</option>
      </select>
      {custom ? (
        <ServiceFields
          prefix="speech-service"
          value={config.service}
          onChange={(service) => {
            setConfig({ ...config, service })
            setError(null)
            setModels([])
          }}
        />
      ) : null}
      <label className={styles.label} htmlFor="speech-protocol">
        {t('speechProtocol')}
      </label>
      <select
        id="speech-protocol"
        className={styles.serviceSelect}
        value={config.protocol}
        onChange={(event) => {
          const protocol = event.target.value as SpeechProtocol
          setConfig({
            ...config,
            protocol,
            voice: protocol === 'deepseek' ? 'stella' : 'alloy',
            audioFormat:
              protocol === 'deepseek' && config.audioFormat === 'mp3' ? 'wav' : config.audioFormat,
          })
          setError(null)
        }}
      >
        <option value="deepseek">DeepSeek</option>
        <option value="openai">{t('speechOpenAi')}</option>
      </select>
      {config.protocol === 'openai' ? (
        <>
          <label className={styles.label} htmlFor="tts-model">
            {t('ttsModelLabel')}
          </label>
          <div className={styles.apiKeyInput}>
            <input
              id="tts-model"
              autoComplete="off"
              spellCheck={false}
              value={config.ttsModel}
              onChange={(event) => setConfig({ ...config, ttsModel: event.target.value })}
            />
          </div>
          {models.length ? (
            <select
              aria-label={t('ttsSelectModel')}
              className={styles.serviceSelect}
              value={config.ttsModel}
              onChange={(event) => setConfig({ ...config, ttsModel: event.target.value })}
            >
              <option value={config.ttsModel}>{config.ttsModel}</option>
              {models
                .filter((model) => model.id !== config.ttsModel)
                .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
            </select>
          ) : null}
          <label className={styles.label} htmlFor="asr-model">
            {t('asrModelLabel')}
          </label>
          <div className={styles.apiKeyInput}>
            <input
              id="asr-model"
              autoComplete="off"
              spellCheck={false}
              value={config.asrModel}
              onChange={(event) => setConfig({ ...config, asrModel: event.target.value })}
            />
          </div>
          <Button size="m" disabled={loading} onClick={() => void loadModels()}>
            {t(loading ? 'modelsLoading' : 'speechFetchModels')}
          </Button>
        </>
      ) : null}
      <label className={styles.label} htmlFor="speech-voice">
        {t('settingsTtsVoice')}
      </label>
      {config.protocol === 'deepseek' ? (
        <select
          id="speech-voice"
          className={styles.serviceSelect}
          value={config.voice}
          onChange={(event) => setConfig({ ...config, voice: event.target.value })}
        >
          <option value="stella">{t('settingsTtsVoiceStella')}</option>
          <option value="tide">{t('settingsTtsVoiceTide')}</option>
        </select>
      ) : (
        <div className={styles.apiKeyInput}>
          <input
            id="speech-voice"
            autoComplete="off"
            spellCheck={false}
            value={config.voice}
            onChange={(event) => setConfig({ ...config, voice: event.target.value })}
          />
        </div>
      )}
      <label className={styles.label} htmlFor="speech-audio-format">
        {t('speechAudioFormat')}
      </label>
      <select
        id="speech-audio-format"
        className={styles.serviceSelect}
        value={config.audioFormat}
        onChange={(event) =>
          setConfig({ ...config, audioFormat: event.target.value as AudioFormat })
        }
      >
        <option value="pcm">PCM</option>
        <option value="wav">WAV</option>
        {config.protocol === 'openai' ? <option value="mp3">MP3</option> : null}
      </select>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <div className={styles.serviceActions}>
        <Button
          size="m"
          onClick={() => {
            try {
              if (custom && !config.service.baseUrl.trim()) {
                throw new Error('Missing URL')
              }
              const normalized = normalizeSpeechConfig({
                ...config,
                service: custom ? config.service : { baseUrl: '', apiKey: '' },
              })
              stopReadAloud()
              setSpeechSettings(normalized)
              setConfig(normalized)
              setError(null)
              showToast({ key: 'serviceSettingsSaved' })
            } catch {
              setError(t('speechConfigInvalid'))
            }
          }}
        >
          {t('speechServiceSave')}
        </Button>
        <Button
          variant="outlined"
          size="m"
          onClick={() =>
            toggleReadAloud('settings-speech-test', t('speechTestText'), (cause) =>
              showToast(describeReadAloudError(cause))
            )
          }
        >
          {t('speechTest')}
        </Button>
      </div>
      <p className={styles.description}>{t('speechTestHint')}</p>
    </section>
  )
}
