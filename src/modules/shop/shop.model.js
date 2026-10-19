import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'

const shopSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    location: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    managerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { timestamps: true },
)

shopSchema.index({ branchId: 1, status: 1 })
shopSchema.index({ status: 1, createdAt: -1 })

export const Shop = mongoose.models.Shop || mongoose.model('Shop', shopSchema)
