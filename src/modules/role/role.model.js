import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    permissionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { timestamps: true },
)

roleSchema.index({ status: 1, createdAt: -1 })

export const Role = mongoose.models.Role || mongoose.model('Role', roleSchema)
