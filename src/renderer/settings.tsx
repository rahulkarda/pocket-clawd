import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { SettingsApp } from './apps/Settings'

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>
)
