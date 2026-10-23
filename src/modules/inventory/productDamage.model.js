import mongoose from 'mongoose'

export const DAMAGE_TYPES = ['broken', 'expired', 'leaked', 'defective', 'lost', 'other']
export const DAMAGE_STATUS = ['draft', 'pending', 'approved', 'rejected', 'cancelled']

const damageLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
    batchNumber: { type: String, trim: true, uppercase: true, default: '' },
    expiryDate: { type: Date, default: null },
    quantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    unitCost: { type: mongoose.Schema.Types.Decimal128, required: true },
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

const productDamageSchema = new mongoose.Schema(
  {
    damageNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    damageType: { type: String, enum: DAMAGE_TYPES, required: true },
    reason: { type: String, trim: true, default: '' },
    status: { type: String, enum: DAMAGE_STATUS, default: 'draft' },
    damageDate: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    requestedApproverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    draftedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    lines: { type: [damageLineSchema], default: [] },
    history: { type: [historySchema], default: [] },
    movementNumbers: { type: [String], default: [] },
    voucherNumber: { type: String, trim: true, default: '' },
    accountingPosted: { type: Boolean, default: false },
    postAccounting: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

productDamageSchema.index({ status: 1, damageDate: 1 })
productDamageSchema.index({ warehouseId: 1, status: 1 })

export const ProductDamage =
  mongoose.models.ProductDamage || mongoose.model('ProductDamage', productDamageSchema)
