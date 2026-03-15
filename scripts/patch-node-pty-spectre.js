/**
 * Patches node-pty .vcxproj files to disable Spectre mitigation on Windows.
 *
 * MSBuild error MSB8040 occurs when the project requires Spectre-mitigated
 * libraries (/Qspectre) but they aren't installed. This script removes that
 * requirement so node-pty can build with a standard MSVC toolchain.
 *
 * Run after `npm install` and before `electron-rebuild`.
 * No-op on non-Windows platforms.
 */

const fs = require('fs')
const path = require('path')

if (process.platform !== 'win32') {
  process.exit(0)
}

const nodePtyDir = path.join(__dirname, '..', 'node_modules', 'node-pty')

if (!fs.existsSync(nodePtyDir)) {
  console.log('node-pty not found in node_modules, skipping Spectre patch')
  process.exit(0)
}

// Find all .vcxproj files recursively under node-pty
function findVcxproj(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findVcxproj(fullPath))
    } else if (entry.name.endsWith('.vcxproj')) {
      results.push(fullPath)
    }
  }
  return results
}

const vcxprojFiles = findVcxproj(nodePtyDir)
let patchCount = 0

for (const file of vcxprojFiles) {
  let content = fs.readFileSync(file, 'utf8')
  const original = content

  // Replace <SpectreMitigation>Spectre</SpectreMitigation> with disabled
  content = content.replace(
    /<SpectreMitigation>Spectre<\/SpectreMitigation>/g,
    '<SpectreMitigation>false</SpectreMitigation>'
  )

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8')
    patchCount++
    console.log(`Patched: ${path.relative(nodePtyDir, file)}`)
  }
}

if (patchCount > 0) {
  console.log(`Spectre mitigation disabled in ${patchCount} .vcxproj file(s)`)
} else {
  console.log('No .vcxproj files needed Spectre patching')
}
