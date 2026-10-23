import mongoose from 'mongoose'

export const MOVEMENT_TYPES = [
  'purchase',
  'sale',
  'transfer_in',
  'transfer_out',
  'purchase_return',
  'sales_return',
  'damage',
  'adjustment',
]

const stockMovementSchema = new mongoose.Schema(
  {
    movementNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    quantityIn: { type: mongoose.Schema.Types.Decimal128, required: true },
    quantityOut: { type: mongoose.Schema.Types.Decimal128, required: true },
    unitCost: { type: mongoose.Schema.Types.Decimal128, required: true },
    movementType: { type: String, enum: MOVEMENT_TYPES, required: true },
    referenceType: { type: String, trim: true, default: '' },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    referenceNumber: { type: String, trim: true, default: '' },
    ledgerNumber: { type: String, trim: true, default: '' },
    movementDate: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

stockMovementSchema.index({ productId: 1, movementDate: 1, warehouseId: 1 })
stockMovementSchema.index({ referenceType: 1, referenceId: 1 })
stockMovementSchema.index({ warehouseId: 1, movementDate: -1 })
stockMovementSchema.index({ branchId: 1, movementDate: -1 })

export const StockMovement =
  mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema)
