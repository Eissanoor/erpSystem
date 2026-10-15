import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'

const PERMISSION_ACTIONS = ['create', 'read', 'update', 'delete', 'approve', 'post', 'all']

const permissionSchema = new mongoose.Schema(
  {
    module: { type: String, required: true, trim: true, lowercase: true },
    action: { type: String, required: true, trim: true, lowercase: true, enum: PERMISSION_ACTIONS },
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true, default: '' },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { timestamps: true },
)

permissionSchema.index({ module: 1, action: 1 }, { unique: true })
permissionSchema.index({ status: 1, module: 1 })

export const Permission = mongoose.models.Permission || mongoose.model('Permission', permissionSchema)
