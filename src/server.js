import { env } from './config/env.js'
import { connectDb } from './config/db.js'
import { seedAuth } from './seed/seedAuth.js'
import { createApp } from './app.js'

await connectDb()
await seedAuth()

const app = createApp()
const server = app.listen(env.port, () => {
  console.log(`API listening on port ${env.port}`)
})

function shutdown() {
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
