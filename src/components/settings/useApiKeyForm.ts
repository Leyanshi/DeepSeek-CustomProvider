import { useEffect, useRef, useState } from 'react'
import { ApiError, fetchModels, verifyApiKey } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import { setApiConnection, useSettings } from '../../services/settings.js'
import { DEFAULT_BASE_URL, normalizeBaseUrl } from '../../services/api/baseUrl.js'
import { normalizeModelId, type ApiModel } from '../../services/api/models.js'
import { useTranslate } from '../../i18n/index.js'

/** Edit the connection and model together; fetching never commits unfinished input. */
export const useApiKeyForm = (onSaved?: () => void) => {
  const t = useTranslate()
  const [value, setValue] = useState('')
  const savedBaseUrl = useSettings((state) => state.baseUrl)
  const savedModel = useSettings((state) => state.model)
  const [baseUrl, setBaseUrl] = useState(savedBaseUrl)
  const [model, setModel] = useState(savedModel)
  const [models, setModels] = useState<ApiModel[]>([])
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelFailure, setModelFailure] = useState<{ cause: unknown } | null>(null)
  const [verifying, setVerifying] = useState(false)
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])
  const [failure, setFailure] = useState<{
    cause: unknown
    invalid?: 'baseUrl' | 'model' | 'key'
  } | null>(null)
  const describeError = (cause: unknown) =>
    cause instanceof ApiError && cause.localMessage
      ? t(cause.localMessage.key, cause.localMessage.params)
      : cause instanceof Error
        ? cause.message
        : String(cause)
  const cause = failure?.cause
  const error =
    failure === null
      ? null
      : failure.invalid === 'baseUrl'
        ? t('baseUrlInvalid')
        : failure.invalid === 'model'
          ? t('modelInvalid')
          : failure.invalid === 'key'
            ? t('modelsApiKeyRequired')
            : classifyApiError(cause) === 'unauthorized'
              ? t('apiKeyInvalid')
              : classifyApiError(cause) === 'network'
                ? t('commonNetworkErrorToast')
                : t('apiKeyVerificationFailed', {
                    message: describeError(cause),
                  })
  const modelError = modelFailure
    ? t('modelsFetchFailed', { message: describeError(modelFailure.cause) })
    : null

  const connection = () => {
    const apiKey = value.trim() || useSettings.getState().apiKey
    if (!apiKey) {
      setFailure({ cause: null, invalid: 'key' })
      return null
    }
    try {
      return { apiKey, normalized: normalizeBaseUrl(baseUrl.trim() || DEFAULT_BASE_URL) }
    } catch (cause) {
      setFailure({ cause, invalid: 'baseUrl' })
      return null
    }
  }
  const clearModels = () => {
    setModels([])
    setModelsLoaded(false)
    setModelFailure(null)
  }
  const loadModels = async () => {
    if (active.current) {
      return
    }
    const candidate = connection()
    if (!candidate) {
      return
    }
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 25000)
    setLoadingModels(true)
    setFailure(null)
    setModelFailure(null)
    try {
      const available = await fetchModels(candidate.apiKey, controller.signal, candidate.normalized)
      if (!controller.signal.aborted) {
        setModels(available)
        setModelsLoaded(true)
      }
    } catch (cause) {
      setModelFailure({ cause })
    } finally {
      clearTimeout(timeout)
      active.current = null
      setLoadingModels(false)
    }
  }

  const submit = async () => {
    if (active.current) {
      return
    }
    const candidate = connection()
    if (!candidate) {
      return
    }
    let modelId: string
    try {
      modelId = normalizeModelId(model)
    } catch (cause) {
      setFailure({ cause, invalid: 'model' })
      return
    }
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 25000)
    setVerifying(true)
    setFailure(null)
    try {
      const saved = useSettings.getState()
      if (candidate.normalized !== saved.baseUrl || value.trim() || !saved.apiKey) {
        await verifyApiKey(candidate.apiKey, controller.signal, candidate.normalized)
      }
      if (controller.signal.aborted) {
        return
      }
      setApiConnection(candidate.apiKey, candidate.normalized, modelId)
      setBaseUrl(candidate.normalized)
      setModel(modelId)
      setValue('')
      onSaved?.()
    } catch (e) {
      setFailure({ cause: e })
    } finally {
      clearTimeout(timeout)
      active.current = null
      setVerifying(false)
    }
  }

  return {
    value,
    setValue: (value: string) => {
      setValue(value)
      setFailure(null)
      clearModels()
    },
    baseUrl,
    setBaseUrl: (value: string) => {
      setBaseUrl(value)
      setFailure(null)
      clearModels()
    },
    resetBaseUrl: () => {
      setBaseUrl(DEFAULT_BASE_URL)
      setFailure(null)
      clearModels()
    },
    model,
    setModel: (value: string) => {
      setModel(value)
      setFailure(null)
    },
    models,
    modelsLoaded,
    loadingModels,
    modelError,
    loadModels,
    connectionDirty: baseUrl !== savedBaseUrl,
    modelDirty: model !== savedModel,
    canSubmit: Boolean(value.trim() || useSettings.getState().apiKey),
    busy: verifying || loadingModels,
    verifying,
    error,
    submit,
  }
}
