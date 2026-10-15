import express from 'express'
import { connectDb } from './src/config/db.js'
import { seedAuth } from './src/seed/seedAuth.js'
import { createApp } from './src/app.js'

await connectDb()
await seedAuth()

const app = createApp()

// Vercel picks this file because it imports Express and default-exports the app.
void express

export default app
