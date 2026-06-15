/**
 * Pre-seed the Keychain + electron-store with values from environment.
 * Run BEFORE `npm run dev` if you want to skip the Settings UI on first launch.
 *
 * Reads:
 *   ANTHROPIC_API_KEY      → Keychain (service=pocket-claude, account=anthropic-api-key)
 *   ANTHROPIC_BASE_URL     → settings.json baseURL (optional; only needed if you
 *                            route Anthropic API calls through a custom proxy)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/seed-credentials.cjs
 */
const path = require('path')
const fs = require('fs')
const os = require('os')

const APP_NAME = 'pocket-claude'

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const baseURL = process.env.ANTHROPIC_BASE_URL || ''

  if (!apiKey) {
    console.error('Set ANTHROPIC_API_KEY in env before running this script.')
    process.exit(1)
  }

  // Keytar
  const keytar = require('keytar')
  await keytar.setPassword(APP_NAME, 'anthropic-api-key', apiKey)
  console.log(`✓ Keychain seeded (service=${APP_NAME})`)

  // electron-store path follows Electron's app.getPath('userData') convention
  // for an app named APP_NAME on macOS:
  //   ~/Library/Application Support/<APP_NAME>/settings.json
  const userData = path.join(os.homedir(), 'Library', 'Application Support', APP_NAME)
  fs.mkdirSync(userData, { recursive: true })
  const settingsPath = path.join(userData, 'settings.json')

  let current = {}
  if (fs.existsSync(settingsPath)) {
    try {
      current = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      current = {}
    }
  }

  const next = {
    ...current,
    ...(baseURL ? { baseURL } : {}),
    onboarded: true
  }
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2))
  console.log(`✓ Settings written to ${settingsPath}`)
  console.log(`  baseURL: ${baseURL || '(default Anthropic API)'}`)
  console.log('Now run: npm run dev')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
