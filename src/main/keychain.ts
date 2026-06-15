/**
 * Keychain wrapper around the `keytar` native module.
 * Stores the Anthropic API key under the macOS Keychain so it never sits in plaintext on disk.
 */
import keytar from 'keytar'
import logger from './logger'

const SERVICE = 'pocket-clawd'
const ACCOUNT = 'anthropic-api-key'

export async function setApiKey(key: string): Promise<void> {
  if (!key || !key.trim()) {
    throw new Error('API key cannot be empty')
  }
  await keytar.setPassword(SERVICE, ACCOUNT, key.trim())
  logger.info('Keychain: API key stored')
}

export async function getApiKey(): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE, ACCOUNT)
  } catch (err) {
    logger.error('Keychain read failed', err)
    return null
  }
}

export async function clearApiKey(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCOUNT)
  logger.info('Keychain: API key cleared')
}

export async function hasApiKey(): Promise<boolean> {
  const k = await getApiKey()
  return !!k && k.length > 0
}
