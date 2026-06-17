import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ChessApp } from './apps/Chess'

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChessApp />
  </React.StrictMode>
)
