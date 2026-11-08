import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadEnvFile } from 'node:process'
const env = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(env)) loadEnvFile(env)
export const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is missing. Run npm run db:start or configure .env.')
