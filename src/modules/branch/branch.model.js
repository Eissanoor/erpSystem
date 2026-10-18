import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    managerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { timestamps: true },
)

branchSchema.index({ status: 1, createdAt: -1 })

export const Branch = mongoose.models.Branch || mongoose.model('Branch', branchSchema)
