import { env } from './config/env.js'
import app from '../server.js'

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
