import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LazyMotion, domAnimation } from 'motion/react'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ErrorBoundary } from './ui'
import './index.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={domAnimation} strict>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </LazyMotion>
  </StrictMode>,
)
