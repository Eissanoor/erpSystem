import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { PAYMENT_TERMS } from './customer.constants.js'

const customerSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    contactName: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: String, trim: true, default: '' },
    currencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Currency', required: true },
    creditLimit: { type: mongoose.Schema.Types.Decimal128, required: true, default: 0 },
    paymentTerms: { type: String, enum: PAYMENT_TERMS, required: true },
    receivableAccount: { type: String, required: true, trim: true },
    receivableAccountId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

customerSchema.index({ name: 1 })
customerSchema.index({ contactName: 1 })
customerSchema.index({ status: 1, createdAt: -1 })

export const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema)
