import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'

const quantityUnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    shortCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    decimalAllowed: { type: Boolean, default: false },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { timestamps: true },
)

quantityUnitSchema.index({ status: 1, createdAt: -1 })

export const QuantityUnit =
  mongoose.models.QuantityUnit || mongoose.model('QuantityUnit', quantityUnitSchema)
