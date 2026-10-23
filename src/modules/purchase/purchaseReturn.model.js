import mongoose from 'mongoose'
import { RETURN_STATUS } from './purchase.constants.js'

const returnLineSchema = new mongoose.Schema(
  {
    purchaseItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseItem', default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
    batchNumber: { type: String, trim: true, uppercase: true, default: '' },
    quantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    unitPrice: { type: mongoose.Schema.Types.Decimal128, required: true },
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

const purchaseReturnSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', default: null },
    currencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Currency', required: true },
    returnDate: { type: Date, required: true },
    status: { type: String, enum: RETURN_STATUS, default: 'draft' },
    reason: { type: String, trim: true, default: '' },
    supplierAuthorization: { type: String, trim: true, uppercase: true, default: '' },
    supplierNote: { type: String, trim: true, default: '' },
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
    stockQuantityOut: {
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

purchaseReturnSchema.index({ branchId: 1, returnDate: -1 })
purchaseReturnSchema.index({ supplierId: 1, status: 1 })
purchaseReturnSchema.index({ purchaseId: 1 })

export const PurchaseReturn =
  mongoose.models.PurchaseReturn || mongoose.model('PurchaseReturn', purchaseReturnSchema)
