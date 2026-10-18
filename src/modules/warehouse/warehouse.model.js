import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'

const warehouseSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    address: { type: String, trim: true, default: '' },
    managerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { timestamps: true },
)

warehouseSchema.index({ branchId: 1, status: 1 })
warehouseSchema.index({ status: 1, createdAt: -1 })

export const Warehouse = mongoose.models.Warehouse || mongoose.model('Warehouse', warehouseSchema)
