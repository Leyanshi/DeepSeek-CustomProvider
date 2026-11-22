import { useTranslate } from '../../i18n/index.js'
import { DEFAULT_GROK_MCP_URL, type GrokSearchConfig } from '../../services/api/grokSearchConfig.js'
import styles from './Settings.module.css'

export const GrokSearchFields = ({
  value,
  onChange,
}: {
  value: GrokSearchConfig
  onChange: (value: GrokSearchConfig) => void
}) => {
  const t = useTranslate()
  const field = (
    key: keyof GrokSearchConfig,
    label: string,
    type = 'password',
    placeholder = ''
  ) => (
    <div key={key} className={styles.serviceField}>
      <label className={styles.label} htmlFor={`grok-${key}`}>
        {label}
      </label>
      <div className={styles.apiKeyInput}>
        <input
          id={`grok-${key}`}
          type={type}
          inputMode={type === 'url' ? 'url' : 'text'}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          value={value[key]}
          placeholder={placeholder}
          onChange={(event) => onChange({ ...value, [key]: event.target.value })}
        />
      </div>
    </div>
  )
  return (
    <>
      <p className={styles.description}>{t('grokServiceDescription')}</p>
      {field('endpoint', t('grokMcpUrl'), 'url', DEFAULT_GROK_MCP_URL)}
      {field('apiKey', t('grokApiKey'), 'password', 'xai-…')}
      {field('baseUrl', t('grokBaseUrl'), 'url', 'https://api.x.ai')}
      {field('model', t('grokModel'), 'text', t('grokModelHint'))}
      <details className={styles.serviceField}>
        <summary>{t('grokAdditionalKeys')}</summary>
        <p className={styles.description}>{t('grokFetchHint')}</p>
        {field('tavilyApiKey', 'Tavily API Key')}
        {field('exaApiKey', 'Exa API Key')}
        {field('tinyfishApiKey', 'TinyFish API Key')}
        {field('firecrawlApiKey', 'Firecrawl API Key')}
        {field('githubToken', 'GitHub Token')}
        {field('mcpApiKey', t('grokMcpKey'))}
      </details>
    </>
  )
}
