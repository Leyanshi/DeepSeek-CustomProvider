import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { normalizeServiceConnection } from '../../services/api/serviceConnection.js'
import { setWebSettings, useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { showToast } from '../base/toastState.js'
import { ServiceFields } from './ServiceFields.js'
import styles from './Settings.module.css'

export const WebServiceSetting = () => {
  const t = useTranslate()
  const saved = useSettings((state) => state.webService)
  const [service, setService] = useState(saved)
  const [custom, setCustom] = useState(Boolean(saved.baseUrl))
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
        value={custom ? 'custom' : 'chat'}
        onChange={(event) => {
          setCustom(event.target.value === 'custom')
          setError(false)
        }}
      >
        <option value="chat">{t('serviceFollowChat')}</option>
        <option value="custom">{t('serviceIndependent')}</option>
      </select>
      {custom ? (
        <ServiceFields
          prefix="web-service"
          value={service}
          onChange={(value) => {
            setService(value)
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
          {t('baseUrlInvalid')}
        </p>
      ) : null}
      <Button
        size="m"
        onClick={() => {
          try {
            if (custom && !service.baseUrl.trim()) {
              throw new Error('Missing service URL')
            }
            setWebSettings(
              custom ? normalizeServiceConnection(service) : { baseUrl: '', apiKey: '' },
              fetch
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
