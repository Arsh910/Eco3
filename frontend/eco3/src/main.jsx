import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { Landing } from './pages/Landing.jsx'
import { HowItWorks } from './pages/HowItWorks.jsx'
import { LargeFileTransfer } from './pages/LargeFileTransfer.jsx'
import './styles.css'

// Loaded only when /app is opened, so the marketing pages never download or run the WebRTC code.
const App = lazy(() => import('./App.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/large-file-transfer" element={<LargeFileTransfer />} />
          <Route path="/app" element={<Suspense fallback={null}><App /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
)
