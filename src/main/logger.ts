/* Lightweight logger for main-process modules. */
/* eslint-disable no-console */

const ts = (): string => new Date().toISOString()

const logger = {
  info: (...args: unknown[]): void => console.log(`[${ts()}] INFO`, ...args),
  warn: (...args: unknown[]): void => console.warn(`[${ts()}] WARN`, ...args),
  error: (...args: unknown[]): void => console.error(`[${ts()}] ERROR`, ...args),
  debug: (...args: unknown[]): void => {
    if (process.env.DEBUG) console.log(`[${ts()}] DEBUG`, ...args)
  }
}

export default logger
