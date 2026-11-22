import { useTranslate } from '../../i18n/index.js'
import type { ServiceConnection } from '../../services/api/serviceConnection.js'
import styles from './Settings.module.css'

export const ServiceFields = ({
  prefix,
  value,
  onChange,
}: {
  prefix: string
  value: ServiceConnection
  onChange: (value: ServiceConnection) => void
}) => {
  const t = useTranslate()
  return (
    <>
      <label className={styles.label} htmlFor={`${prefix}-base-url`}>
        {t('serviceBaseUrl')}
      </label>
      <div className={styles.apiKeyInput}>
        <input
          id={`${prefix}-base-url`}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          value={value.baseUrl}
          placeholder="https://api.deepseek.com"
          onChange={(event) => onChange({ ...value, baseUrl: event.target.value })}
        />
      </div>
      <label className={styles.label} htmlFor={`${prefix}-api-key`}>
        {t('serviceApiKey')}
      </label>
      <div className={styles.apiKeyInput}>
        <input
          id={`${prefix}-api-key`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value.apiKey}
          placeholder={t('serviceApiKeyHint')}
          onChange={(event) => onChange({ ...value, apiKey: event.target.value })}
        />
      </div>
    </>
  )
}
