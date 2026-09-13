import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { sfxr } from 'jsfxr'

const root = new URL('../audio/sfx/', import.meta.url)
for (const folder of readdirSync(root, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue
  if (process.argv.length > 2 && !process.argv.slice(2).includes(folder.name)) continue
  const preset = new URL(`${folder.name}/preset.json`, root)
  const params = JSON.parse(readFileSync(preset, 'utf8'))
  const sound = sfxr.toWave(params)
  writeFileSync(new URL('sound.wav', preset), Buffer.from(sound.wav))
  console.info(`sfx/${folder.name}: sound.wav`)
}
