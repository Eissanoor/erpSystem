import mongoose from 'mongoose'

export const ADJUSTMENT_STATUS = ['draft', 'approved', 'cancelled']

const adjustmentLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    systemQuantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    actualQuantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    difference: { type: mongoose.Schema.Types.Decimal128, required: true },
  },
  { _id: true },
)

const stockAdjustmentSchema = new mongoose.Schema(
  {
    adjustmentNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    status: { type: String, enum: ADJUSTMENT_STATUS, default: 'draft' },
    adjustmentDate: { type: Date, required: true },
    lines: { type: [adjustmentLineSchema], default: [] },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

stockAdjustmentSchema.index({ status: 1, adjustmentDate: 1 })
stockAdjustmentSchema.index({ warehouseId: 1, status: 1 })

export const StockAdjustment =
  mongoose.models.StockAdjustment || mongoose.model('StockAdjustment', stockAdjustmentSchema)
