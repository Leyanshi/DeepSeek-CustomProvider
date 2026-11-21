import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { StartupBoundary } from './app/StartupBoundary.js'
import { setupTheme } from './app/theme.js'
import { setupAndroid } from './services/android.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()
setupAndroid()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StartupBoundary>
    <App />
  </StartupBoundary>
)
