import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { SHOP_TYPES } from './shop.constants.js'

const documentSchema = new mongoose.Schema(
  {
    type: { type: String, trim: true, default: '' },
    reference: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
  },
  { _id: false },
)

const shopSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    shopType: { type: String, enum: SHOP_TYPES },
    location: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    managerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    priceList: { type: String, trim: true, default: '' },
    cashAccount: { type: String, trim: true, default: '' },
    openingHours: { type: String, trim: true, default: '' },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
    document: { type: documentSchema, default: () => ({}) },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

shopSchema.index({ branchId: 1, status: 1 })
shopSchema.index({ status: 1, createdAt: -1 })

export const Shop = mongoose.models.Shop || mongoose.model('Shop', shopSchema)
