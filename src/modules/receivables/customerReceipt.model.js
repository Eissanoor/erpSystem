import mongoose from 'mongoose'
import { RECEIPT_METHODS, RECEIPT_STATUS } from './receivables.constants.js'

const allocationSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerInvoice', required: true },
    invoiceNumber: { type: String, trim: true, uppercase: true, default: '' },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
  },
  { _id: true },
)

const customerReceiptSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    currencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Currency', required: true },
    receiptDate: { type: Date, required: true },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    allocatedAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    unallocatedAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    receiptMethod: { type: String, enum: RECEIPT_METHODS, required: true },
    bankName: { type: String, trim: true, default: '' },
    voucherNumber: { type: String, trim: true, default: '' },
    status: { type: String, enum: RECEIPT_STATUS, default: 'posted' },
    allocations: { type: [allocationSchema], default: [] },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

customerReceiptSchema.index({ customerId: 1, receiptDate: -1 })
customerReceiptSchema.index({ branchId: 1, receiptDate: -1 })
customerReceiptSchema.index({ status: 1, customerId: 1 })

export const CustomerReceipt =
  mongoose.models.CustomerReceipt || mongoose.model('CustomerReceipt', customerReceiptSchema)
