import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { PomodoroApp } from './apps/Pomodoro'

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PomodoroApp />
  </React.StrictMode>
)
