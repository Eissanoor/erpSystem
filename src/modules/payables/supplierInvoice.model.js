import mongoose from 'mongoose'
import { INVOICE_STATUS } from './payables.constants.js'

const supplierInvoiceSchema = new mongoose.Schema(
  {
    purchaseNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
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

supplierInvoiceSchema.index({ supplierId: 1, dueDate: 1 })
supplierInvoiceSchema.index({ branchId: 1, invoiceDate: -1 })
supplierInvoiceSchema.index({ status: 1, supplierId: 1 })

export const SupplierInvoice =
  mongoose.models.SupplierInvoice || mongoose.model('SupplierInvoice', supplierInvoiceSchema)
