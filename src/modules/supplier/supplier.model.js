import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { PAYMENT_TERMS } from './supplier.constants.js'

const supplierSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: String, trim: true, default: '' },
    currencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Currency', required: true },
    paymentTerms: { type: String, enum: PAYMENT_TERMS, required: true },
    payableAccount: { type: String, required: true, trim: true },
    payableAccountId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

supplierSchema.index({ name: 1 })
supplierSchema.index({ status: 1, createdAt: -1 })

export const Supplier = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema)
