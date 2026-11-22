import { create } from 'zustand'
import { normalizeLocation, type UserLocation } from './location.js'
import { DEFAULT_BASE_URL, normalizeBaseUrl } from './api/baseUrl.js'
import { DEFAULT_MODEL, normalizeModelId } from './api/models.js'
import {
  EMPTY_SERVICE,
  normalizeServiceConnection,
  type ServiceConnection,
} from './api/serviceConnection.js'
import {
  defaultSpeechConfig,
  normalizeSpeechConfig,
  type SpeechConfig,
} from './api/speechConfig.js'
import { resetModelCapabilities } from './api/modelCapabilities.js'
import {
  defaultGrokSearchConfig,
  normalizeGrokSearchConfig,
  type GrokSearchConfig,
  type WebProvider,
} from './api/grokSearchConfig.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 本机设置，存 localStorage：API Key、Base URL、模型、语言、主题、位置及界面偏好 */
type Settings = {
  apiKey: string | null
  baseUrl: string
  model: string
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  speech: SpeechConfig
  thinking: boolean
  search: boolean
  webService: ServiceConnection
  webProvider: WebProvider
  grokSearch: GrokSearchConfig
  webFetch: boolean
  siderCollapsed: boolean
  autoTitle: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  baseUrl: 'chat-demo:base-url',
  model: 'chat-demo:model',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  speech: 'chat-demo:speech',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  webService: 'chat-demo:web-service',
  webProvider: 'chat-demo:web-provider',
  grokSearch: 'chat-demo:grok-search',
  webFetch: 'chat-demo:web-fetch',
  siderCollapsed: 'chat-demo:sider-collapsed',
  autoTitle: 'chat-demo:auto-title',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

const initialSpeech = (): SpeechConfig => {
  try {
    return normalizeSpeechConfig(JSON.parse(read(KEYS.speech) ?? 'null'))
  } catch {
    return defaultSpeechConfig(read(KEYS.ttsVoice) ?? 'stella')
  }
}

const initialBaseUrl = () => {
  try {
    const configured = __API_ORIGIN__.startsWith('https://appassets.androidplatform.net/')
      ? DEFAULT_BASE_URL
      : __API_ORIGIN__
    return normalizeBaseUrl(read(KEYS.baseUrl) ?? configured)
  } catch {
    return DEFAULT_BASE_URL
  }
}

const initialModel = () => {
  try {
    return normalizeModelId(read(KEYS.model) ?? DEFAULT_MODEL)
  } catch {
    return DEFAULT_MODEL
  }
}

const initialService = (key: string): ServiceConnection => {
  try {
    const value = JSON.parse(read(key) ?? 'null')
    if (value && typeof value.baseUrl === 'string' && typeof value.apiKey === 'string') {
      return normalizeServiceConnection(value)
    }
  } catch {
    /* Invalid saved settings fall back to the chat connection. */
  }
  return { ...EMPTY_SERVICE }
}

const initialGrokSearch = (): GrokSearchConfig => {
  try {
    return normalizeGrokSearchConfig(JSON.parse(read(KEYS.grokSearch) ?? 'null'))
  } catch {
    return defaultGrokSearchConfig()
  }
}

export const useSettings = create<Settings>(() => ({
  apiKey: read(KEYS.apiKey),
  baseUrl: initialBaseUrl(),
  model: initialModel(),
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  speech: initialSpeech(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  webService: initialService(KEYS.webService),
  webProvider: read(KEYS.webProvider) === 'grok' ? 'grok' : 'deepseek',
  grokSearch: initialGrokSearch(),
  webFetch: read(KEYS.webFetch) !== 'false',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
  autoTitle: read(KEYS.autoTitle) !== 'false',
}))

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setSpeechSettings = (config: SpeechConfig) => {
  const speech = normalizeSpeechConfig(config)
  write(KEYS.speech, JSON.stringify(speech))
  useSettings.setState({ speech })
}

export const setApiConnection = (
  apiKey: string,
  baseUrl: string,
  model = useSettings.getState().model
) => {
  const normalized = normalizeBaseUrl(baseUrl)
  const normalizedModel = normalizeModelId(model)
  if (apiKey !== useSettings.getState().apiKey) {
    resetModelCapabilities()
  }
  write(KEYS.apiKey, apiKey)
  write(KEYS.baseUrl, normalized)
  write(KEYS.model, normalizedModel)
  useSettings.setState({ apiKey, baseUrl: normalized, model: normalizedModel })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setWebSettings = (
  service: ServiceConnection,
  webFetch: boolean,
  webProvider: WebProvider = 'deepseek',
  grokConfig: GrokSearchConfig = useSettings.getState().grokSearch
) => {
  const webService = normalizeServiceConnection(service)
  const grokSearch = normalizeGrokSearchConfig(grokConfig)
  write(KEYS.webService, JSON.stringify(webService))
  write(KEYS.webFetch, String(webFetch))
  write(KEYS.webProvider, webProvider)
  write(KEYS.grokSearch, JSON.stringify(grokSearch))
  useSettings.setState({ webService, webFetch, webProvider, grokSearch })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}

export const setAutoTitle = (autoTitle: boolean) => {
  write(KEYS.autoTitle, String(autoTitle))
  useSettings.setState({ autoTitle })
}
