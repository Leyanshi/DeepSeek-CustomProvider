import { useTranslate } from '../../i18n/index.js'
import { DEFAULT_MODEL } from '../../services/api/models.js'
import { Button } from '../base/Button.js'
import { Select } from '../base/Select.js'
import type { ApiKeyEditor } from './ApiKeyField.js'
import styles from './Settings.module.css'

export const ModelField = ({ editor: { form } }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  return (
    <div className={styles.cell} aria-busy={form.loadingModels}>
      <div className={styles.apiKey}>
        <div className={styles.modelHeader}>
          <span className={styles.label}>{t('modelLabel')}</span>
          <Button
            variant="outlined"
            size="s"
            disabled={form.busy || !form.canSubmit}
            onClick={() => void form.loadModels()}
          >
            {t(form.loadingModels ? 'modelsLoading' : 'modelsFetch')}
          </Button>
        </div>
        {form.models.length > 0 ? (
          <Select
            value={form.model.trim()}
            ariaLabel={t('modelSelect')}
            placeholder={t('modelSelect')}
            className={styles.modelSelect}
            disabled={form.busy}
            options={form.models.map(({ id, name }) => ({
              value: id,
              label: name === id ? id : `${name} (${id})`,
            }))}
            onChange={form.setModel}
          />
        ) : null}
        <label className={styles.label} htmlFor="api-model-id">
          {t('modelCustomId')}
        </label>
        <div className={styles.apiKeyInput}>
          <input
            id="api-model-id"
            type="text"
            value={form.model}
            placeholder={DEFAULT_MODEL}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            disabled={form.busy}
            onChange={(event) => form.setModel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                void form.submit()
              }
            }}
          />
        </div>
        <div className={styles.description}>{t('modelDescription')}</div>
        {form.modelsLoaded ? (
          <div className={styles.description} role="status">
            {form.models.length
              ? t('modelsLoaded', { count: form.models.length })
              : t('modelsEmpty')}
          </div>
        ) : null}
        {form.modelError ? (
          <div className={styles.error} role="alert">
            {form.modelError}
          </div>
        ) : null}
      </div>
    </div>
  )
}
