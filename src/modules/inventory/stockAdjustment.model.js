import mongoose from 'mongoose'

export const ADJUSTMENT_STATUS = ['draft', 'pending', 'approved', 'rejected', 'cancelled']

const adjustmentLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
    systemQuantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    actualQuantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    difference: { type: mongoose.Schema.Types.Decimal128, required: true },
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

const stockAdjustmentSchema = new mongoose.Schema(
  {
    adjustmentNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    reason: { type: String, trim: true, default: '' },
    countReference: { type: String, trim: true, uppercase: true, default: '' },
    countNote: { type: String, trim: true, default: '' },
    status: { type: String, enum: ADJUSTMENT_STATUS, default: 'draft' },
    adjustmentDate: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    requestedApproverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    draftedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    lines: { type: [adjustmentLineSchema], default: [] },
    history: { type: [historySchema], default: [] },
    movementNumbers: { type: [String], default: [] },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

stockAdjustmentSchema.index({ status: 1, adjustmentDate: 1 })
stockAdjustmentSchema.index({ warehouseId: 1, status: 1 })

export const StockAdjustment =
  mongoose.models.StockAdjustment || mongoose.model('StockAdjustment', stockAdjustmentSchema)
