import { useState } from 'react'
import { IconEditOutline16 } from '../base/icons.js'
import { useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { useApiKeyForm } from './useApiKeyForm.js'
import { useTranslate } from '../../i18n/index.js'
import { DEFAULT_BASE_URL } from '../../services/api/baseUrl.js'
import styles from './Settings.module.css'

/** API Key 的编辑状态：输入框与移动端底部的「确定」按钮共用 */
export const useApiKeyEditor = () => {
  const apiKey = useSettings((state) => state.apiKey)
  const [editing, setEditing] = useState(false)
  const form = useApiKeyForm(() => setEditing(false))
  return { apiKey, editing, setEditing, form, showInput: !apiKey || editing }
}

export type ApiKeyEditor = ReturnType<typeof useApiKeyEditor>

/** API Key：保存后只显示掩码，点编辑按钮才能重新输入 */
export const ApiKeyField = ({ editor }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const { apiKey, editing, setEditing, form } = editor

  return (
    <div className={styles.cell} aria-busy={form.busy}>
      <div className={styles.apiKey}>
        <label className={styles.label} htmlFor="api-base-url">
          {t('baseUrlLabel')}
        </label>
        <div className={styles.apiKeyInput}>
          <input
            id="api-base-url"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            placeholder={DEFAULT_BASE_URL}
            value={form.baseUrl}
            disabled={form.busy}
            onChange={(event) => form.setBaseUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                void form.submit()
              }
            }}
          />
        </div>
        <div className={styles.description}>{t('baseUrlDescription')}</div>
        {form.baseUrl !== DEFAULT_BASE_URL ? (
          <button
            type="button"
            className={styles.confirm}
            disabled={form.busy}
            onClick={form.resetBaseUrl}
          >
            {t('baseUrlReset')}
          </button>
        ) : null}
        <div className={styles.label}>{t('apiKeyStart')}</div>
        {apiKey && !editing ? (
          <div className={styles.apiKeySaved}>
            <span className={styles.apiKeyMask}>{'*'.repeat(apiKey.length)}</span>
            <IconButton
              tone="primary"
              icon={<IconEditOutline16 />}
              tooltip={t('apiKeyEdit')}
              disabled={form.busy}
              onClick={() => setEditing(true)}
            />
          </div>
        ) : (
          <div className={styles.apiKeyInput}>
            <input
              type="password"
              placeholder={t('apiKeyPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              // 移动端打开设置时不弹键盘，点编辑后才聚焦
              autoFocus={!isMobile || editing}
              value={form.value}
              disabled={form.busy}
              onChange={(event) => form.setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  void form.submit()
                }
              }}
              onBlur={() => {
                // 修改时没输入就离开，回到已保存的状态
                if (apiKey && !form.value.trim()) {
                  setEditing(false)
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** One confirmation saves the connection and model together. */
export const ApiKeyConfirm = ({ editor: { showInput, form } }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const visible = (showInput || form.connectionDirty || form.modelDirty) && form.canSubmit
  return (
    <>
      {form.error ? (
        <div className={styles.error} role="alert">
          {form.error}
        </div>
      ) : null}
      {visible ? (
        isMobile ? (
          <button
            type="button"
            className={styles.mobileConfirm}
            disabled={form.busy}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void form.submit()}
          >
            {form.verifying ? t('apiKeyVerifying') : t('confirm')}
          </button>
        ) : (
          <Button size="m" disabled={form.busy} onClick={() => void form.submit()}>
            {form.verifying ? t('apiKeyVerifying') : t('confirm')}
          </Button>
        )
      ) : null}
    </>
  )
}
