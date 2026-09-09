import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@deepread/design-system/tokens.css'
import './styles/global.css'
import { App } from './App'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container #root is missing in index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
