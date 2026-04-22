import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './assets/globals.css'
import * as Sentry from '@sentry/electron/renderer'

// Sentry crash reporting — enable by setting SENTRY_DSN in the main process env
Sentry.init()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
