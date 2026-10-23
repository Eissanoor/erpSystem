import mongoose from 'mongoose'
import { PAYMENT_METHODS, PAYMENT_STATUS } from './payables.constants.js'

const allocationSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierInvoice', required: true },
    purchaseNumber: { type: String, trim: true, uppercase: true, default: '' },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
  },
  { _id: true },
)

const supplierPaymentSchema = new mongoose.Schema(
  {
    paymentNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    currencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Currency', required: true },
    paymentDate: { type: Date, required: true },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    allocatedAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    unallocatedAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    bankName: { type: String, trim: true, default: '' },
    status: { type: String, enum: PAYMENT_STATUS, default: 'posted' },
    allocations: { type: [allocationSchema], default: [] },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

supplierPaymentSchema.index({ supplierId: 1, paymentDate: -1 })
supplierPaymentSchema.index({ branchId: 1, paymentDate: -1 })
supplierPaymentSchema.index({ status: 1, supplierId: 1 })

export const SupplierPayment =
  mongoose.models.SupplierPayment || mongoose.model('SupplierPayment', supplierPaymentSchema)
