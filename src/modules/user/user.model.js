import mongoose from 'mongoose'
import { USER_STATUS } from '../../common/constants/status.js'

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true, select: false },
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
    branchIds: [{ type: mongoose.Schema.Types.ObjectId }],
    warehouseIds: [{ type: mongoose.Schema.Types.ObjectId }],
    status: { type: String, enum: USER_STATUS, default: 'active' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
)

userSchema.index({ status: 1, createdAt: -1 })
userSchema.index({ roleIds: 1 })

userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash
    return ret
  },
})

export const User = mongoose.models.User || mongoose.model('User', userSchema)
