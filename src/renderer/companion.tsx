import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { CompanionApp } from './apps/Companion'

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <CompanionApp />
  </React.StrictMode>
)
