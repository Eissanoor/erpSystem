import mongoose from 'mongoose'

const counterSchema = new mongoose.Schema(
  {
    prefix: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
)

export const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema)

function formatNumber(prefix, seq) {
  return `${prefix}-${String(seq).padStart(6, '0')}`
}

export const documentNumber = {
  async next(prefix, session) {
    const options = { new: true, upsert: true, setDefaultsOnInsert: true }
    if (session) options.session = session

    try {
      const counter = await Counter.findOneAndUpdate({ prefix }, { $inc: { seq: 1 } }, options)
      return formatNumber(prefix, counter.seq)
    } catch (error) {
      if (error?.code !== 11000) throw error
      const counter = await Counter.findOneAndUpdate(
        { prefix },
        { $inc: { seq: 1 } },
        { new: true, session },
      )
      return formatNumber(prefix, counter.seq)
    }
  },
}
