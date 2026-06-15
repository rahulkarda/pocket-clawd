import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { TodoApp } from './apps/Todo'

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TodoApp />
  </React.StrictMode>
)
