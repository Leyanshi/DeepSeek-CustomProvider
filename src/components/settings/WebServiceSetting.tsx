import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { normalizeServiceConnection } from '../../services/api/serviceConnection.js'
import { setWebSettings, useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { showToast } from '../base/toastState.js'
import { ServiceFields } from './ServiceFields.js'
import styles from './Settings.module.css'
import { GrokSearchFields } from './GrokSearchFields.js'
import { normalizeGrokSearchConfig } from '../../services/api/grokSearchConfig.js'

export const WebServiceSetting = () => {
  const t = useTranslate()
  const saved = useSettings((state) => state.webService)
  const [service, setService] = useState(saved)
  const [source, setSource] = useState(
    useSettings.getState().webProvider === 'grok' ? 'grok' : saved.baseUrl ? 'custom' : 'chat'
  )
  const [grok, setGrok] = useState(useSettings.getState().grokSearch)
  const [fetch, setFetch] = useState(useSettings.getState().webFetch)
  const [error, setError] = useState(false)
  return (
    <div className={styles.cell}>
      <div className={styles.label}>{t('webServiceTitle')}</div>
      <p className={styles.description}>{t('webServiceDescription')}</p>
      <label className={styles.label} htmlFor="web-service-source">
        {t('webServiceSource')}
      </label>
      <select
        id="web-service-source"
        className={styles.serviceSelect}
        value={source}
        onChange={(event) => {
          setSource(event.target.value)
          setError(false)
        }}
      >
        <option value="chat">{t('serviceFollowChat')}</option>
        <option value="custom">{t('serviceIndependent')}</option>
        <option value="grok">GrokSearch-rs (MCP)</option>
      </select>
      {source === 'custom' ? (
        <ServiceFields
          prefix="web-service"
          value={service}
          onChange={(value) => {
            setService(value)
            setError(false)
          }}
        />
      ) : null}
      {source === 'grok' ? (
        <GrokSearchFields
          value={grok}
          onChange={(value) => {
            setGrok(value)
            setError(false)
          }}
        />
      ) : null}
      <label className={styles.serviceCheck}>
        <input
          type="checkbox"
          checked={fetch}
          onChange={(event) => setFetch(event.target.checked)}
        />
        {t('webFetchLabel')}
      </label>
      {error ? (
        <p role="alert" className={styles.error}>
          {t(source === 'grok' ? 'grokConfigInvalid' : 'baseUrlInvalid')}
        </p>
      ) : null}
      <Button
        size="m"
        onClick={() => {
          try {
            if (source === 'custom' && !service.baseUrl.trim()) {
              throw new Error('Missing service URL')
            }
            if (source === 'grok' && !grok.apiKey.trim()) {
              throw new Error('Missing Grok API Key')
            }
            setWebSettings(
              source === 'grok'
                ? saved
                : source === 'custom'
                  ? normalizeServiceConnection(service)
                  : { baseUrl: '', apiKey: '' },
              fetch,
              source === 'grok' ? 'grok' : 'deepseek',
              source === 'grok'
                ? normalizeGrokSearchConfig(grok)
                : useSettings.getState().grokSearch
            )
            setError(false)
            showToast({ key: 'serviceSettingsSaved' })
          } catch {
            setError(true)
          }
        }}
      >
        {t('webServiceSave')}
      </Button>
    </div>
  )
}
