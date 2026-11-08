import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const children = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { stdio: 'inherit', env: { ...process.env, PEOPLEOPS_PORT: '4310' } }),
  spawn(process.execPath, [vite], { stdio: 'inherit' }),
]
let stopping = false
function stop(code) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exitCode = code
}
for (const child of children) {
  child.on('exit', code => stop(code ?? 0))
  child.on('error', error => {
    console.error(error)
    stop(1)
  })
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

