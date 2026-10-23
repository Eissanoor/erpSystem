import mongoose from 'mongoose'
import { INVOICE_STATUS } from './receivables.constants.js'

const customerInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    currencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Currency', required: true },
    invoiceDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    paidAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    status: { type: String, enum: INVOICE_STATUS, default: 'posted' },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

customerInvoiceSchema.index({ customerId: 1, dueDate: 1 })
customerInvoiceSchema.index({ branchId: 1, invoiceDate: -1 })
customerInvoiceSchema.index({ status: 1, customerId: 1 })

export const CustomerInvoice =
  mongoose.models.CustomerInvoice || mongoose.model('CustomerInvoice', customerInvoiceSchema)
