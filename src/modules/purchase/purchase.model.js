import mongoose from 'mongoose'
import { PURCHASE_STATUS, RECEIVING_STATES } from './purchase.constants.js'

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    currencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Currency', required: true },
    exchangeRate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('1'),
    },
    purchaseDate: { type: Date, required: true },
    dueDate: { type: Date, default: null },
    supplierInvoiceNo: { type: String, trim: true, uppercase: true, default: '' },
    receivedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    receivedByName: { type: String, trim: true, default: '' },
    status: { type: String, enum: PURCHASE_STATUS, default: 'draft' },
    receivingState: { type: String, enum: RECEIVING_STATES, default: 'ordered' },
    discountMethod: { type: String, enum: ['document', 'line'], default: 'document' },
    taxRate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    taxBasis: { type: String, enum: ['net_subtotal'], default: 'net_subtotal' },
    subtotal: { type: mongoose.Schema.Types.Decimal128, required: true },
    discount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    netSubtotal: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    tax: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    total: { type: mongoose.Schema.Types.Decimal128, required: true },
    paidAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    balanceAmount: { type: mongoose.Schema.Types.Decimal128, required: true },
    advancePaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierPayment', default: null },
    receivingNote: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    approvedAt: { type: Date, default: null },
    postedAt: { type: Date, default: null },
    payableInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierInvoice', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

purchaseSchema.index({ supplierId: 1, purchaseDate: -1 })
purchaseSchema.index({ branchId: 1, purchaseDate: -1 })
purchaseSchema.index({ status: 1, receivingState: 1 })

export const Purchase = mongoose.models.Purchase || mongoose.model('Purchase', purchaseSchema)
