import mongoose from 'mongoose'
import { SALE_STATUS, SHIPPING_METHODS } from './sale.constants.js'

const saleSchema = new mongoose.Schema(
  {
    saleNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    currencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Currency', required: true },
    exchangeRate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('1'),
    },
    saleDate: { type: Date, required: true },
    dueDate: { type: Date, default: null },
    soldById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    soldByName: { type: String, trim: true, default: '' },
    status: { type: String, enum: SALE_STATUS, default: 'draft' },
    discountMethod: { type: String, enum: ['document', 'line'], default: 'line' },
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
    shippingAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    total: { type: mongoose.Schema.Types.Decimal128, required: true },
    paidAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    balanceAmount: { type: mongoose.Schema.Types.Decimal128, required: true },
    receiptMethod: { type: String, enum: ['cash', 'bank', ''], default: '' },
    bankName: { type: String, trim: true, default: '' },
    customerReference: { type: String, trim: true, uppercase: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    createShipmentAfterPost: { type: Boolean, default: false },
    shippingMethod: { type: String, enum: SHIPPING_METHODS, default: 'none' },
    shippingEta: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    postedAt: { type: Date, default: null },
    reservedAt: { type: Date, default: null },
    receivableInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerInvoice',
      default: null,
    },
    receiptId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerReceipt', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

saleSchema.index({ customerId: 1, saleDate: -1 })
saleSchema.index({ branchId: 1, saleDate: -1 })
saleSchema.index({ status: 1, saleDate: -1 })
saleSchema.index({ warehouseId: 1, saleDate: -1 })

export const Sale = mongoose.models.Sale || mongoose.model('Sale', saleSchema)
