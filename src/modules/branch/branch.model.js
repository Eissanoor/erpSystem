import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { BRANCH_TYPES } from './branch.constants.js'

const documentSchema = new mongoose.Schema(
  {
    type: { type: String, trim: true, default: '' },
    reference: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
  },
  { _id: false },
)

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchType: { type: String, enum: BRANCH_TYPES },
    openingDate: { type: Date, default: null },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    location: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    managerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    defaultWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    defaultShopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
    costCentre: { type: String, trim: true, default: '' },
    documentPrefix: { type: String, trim: true, uppercase: true, default: '' },
    document: { type: documentSchema, default: () => ({}) },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

branchSchema.index({ status: 1, createdAt: -1 })

export const Branch = mongoose.models.Branch || mongoose.model('Branch', branchSchema)
