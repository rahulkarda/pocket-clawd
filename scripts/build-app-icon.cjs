/**
 * Build the macOS app icon (.icns) from assets/app-icon.svg.
 *
 * Pipeline:
 *   1. sharp rasterizes the SVG into the standard macOS iconset sizes
 *      (16, 32, 64, 128, 256, 512, 1024 — both @1x and @2x where named)
 *   2. Files written to assets/icon.iconset/ as required by iconutil
 *   3. `iconutil -c icns` (macOS-only) packages them into assets/icon.icns
 *
 * electron-builder picks the .icns up via the `mac.icon` field in
 * electron-builder.json.
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const sharp = require('sharp')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'assets', 'app-icon.svg')
const ICONSET = path.join(ROOT, 'assets', 'icon.iconset')
const OUT = path.join(ROOT, 'assets', 'icon.icns')

// Each entry: file name + raster size in px. Names follow Apple's
// iconset convention so iconutil can package them as .icns.
const SIZES = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 }
]

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing source SVG:', SRC)
    process.exit(1)
  }
  fs.rmSync(ICONSET, { recursive: true, force: true })
  fs.mkdirSync(ICONSET, { recursive: true })

  const svg = fs.readFileSync(SRC)
  for (const { name, size } of SIZES) {
    await sharp(svg, { density: 384 })
      .resize(size, size)
      .png()
      .toFile(path.join(ICONSET, name))
    process.stdout.write(`  • ${name} (${size}×${size})\n`)
  }

  // macOS only — bail out gracefully if iconutil isn't available.
  try {
    execSync(`iconutil -c icns -o "${OUT}" "${ICONSET}"`, { stdio: 'inherit' })
    console.log('App icon written:', OUT)
  } catch (err) {
    console.error('iconutil failed; on macOS only.', err.message)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
