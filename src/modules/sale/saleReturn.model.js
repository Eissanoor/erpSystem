import mongoose from 'mongoose'
import { RETURN_CONDITIONS, SALE_RETURN_STATUS } from './sale.constants.js'

const returnLineSchema = new mongoose.Schema(
  {
    saleItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'SaleItem', default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
    batchNumber: { type: String, trim: true, uppercase: true, default: '' },
    soldQuantity: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    quantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    unitPrice: { type: mongoose.Schema.Types.Decimal128, required: true },
    unitCost: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    discountAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    taxRate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    taxAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    lineNet: { type: mongoose.Schema.Types.Decimal128, required: true },
    lineTotal: { type: mongoose.Schema.Types.Decimal128, required: true },
  },
  { _id: true },
)

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, trim: true, default: '' },
    action: { type: String, trim: true, required: true },
    note: { type: String, trim: true, default: '' },
  },
  { _id: true },
)

const saleReturnSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    currencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Currency', required: true },
    returnDate: { type: Date, required: true },
    status: { type: String, enum: SALE_RETURN_STATUS, default: 'draft' },
    reason: { type: String, trim: true, default: '' },
    condition: { type: String, enum: RETURN_CONDITIONS, default: 'unopened_resalable' },
    returnNote: { type: String, trim: true, default: '' },
    taxRate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    subtotal: { type: mongoose.Schema.Types.Decimal128, required: true },
    discount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    tax: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    total: { type: mongoose.Schema.Types.Decimal128, required: true },
    inventoryCost: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    stockQuantityIn: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    lines: { type: [returnLineSchema], default: [] },
    history: { type: [historySchema], default: [] },
    notes: { type: String, trim: true, default: '' },
    draftedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    postedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

saleReturnSchema.index({ branchId: 1, returnDate: -1 })
saleReturnSchema.index({ customerId: 1, status: 1 })
saleReturnSchema.index({ saleId: 1 })

export const SaleReturn = mongoose.models.SaleReturn || mongoose.model('SaleReturn', saleReturnSchema)
