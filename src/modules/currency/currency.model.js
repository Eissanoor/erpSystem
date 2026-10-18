import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'

const currencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, minlength: 3, maxlength: 3 },
    symbol: { type: String, trim: true, default: '' },
    decimalPlaces: { type: Number, required: true, min: 0, max: 6, default: 2 },
    isBaseCurrency: { type: Boolean, default: false },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { timestamps: true },
)

currencySchema.index({ status: 1, createdAt: -1 })

export const Currency = mongoose.models.Currency || mongoose.model('Currency', currencySchema)
