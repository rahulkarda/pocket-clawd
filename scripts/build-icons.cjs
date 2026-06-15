/**
 * Build script: rasterize the tray template SVG to a 22×22 + @2x PNG.
 * Run: npm run build:icons
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'assets', 'tray-iconTemplate.svg')
const OUT_1X = path.join(ROOT, 'assets', 'tray-iconTemplate.png')
const OUT_2X = path.join(ROOT, 'assets', 'tray-iconTemplate@2x.png')

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing', SRC)
    process.exit(1)
  }
  const svg = fs.readFileSync(SRC)
  await sharp(svg).resize(22, 22).png().toFile(OUT_1X)
  await sharp(svg).resize(44, 44).png().toFile(OUT_2X)
  console.log('Tray icons written:', OUT_1X, OUT_2X)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
