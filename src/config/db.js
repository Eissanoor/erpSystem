import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDb() {
  mongoose.set('strictQuery', true)
  await mongoose.connect(env.mongodbUri)
}

export function dbStatus() {
  return mongoose.connection.readyState === 1 ? 'up' : 'down'
}
