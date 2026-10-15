import mongoose from 'mongoose'
import { connectDb } from '../config/db.js'
import { seedAuth } from './seedAuth.js'

await connectDb()
await seedAuth()
await mongoose.disconnect()
console.log('seed complete')
