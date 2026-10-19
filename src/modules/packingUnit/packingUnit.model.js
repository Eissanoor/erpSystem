import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'

const packingUnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    shortCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    conversionQuantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    quantityUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuantityUnit', required: true },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { timestamps: true },
)

packingUnitSchema.index({ quantityUnitId: 1, status: 1 })
packingUnitSchema.index({ status: 1, createdAt: -1 })

export const PackingUnit = mongoose.models.PackingUnit || mongoose.model('PackingUnit', packingUnitSchema)
