import mongoose from 'mongoose'

const stockBalanceSchema = new mongoose.Schema(
  {
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    quantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    reservedQuantity: { type: mongoose.Schema.Types.Decimal128, required: true },
  },
  { timestamps: true },
)

stockBalanceSchema.index(
  { warehouseId: 1, productId: 1 },
  { unique: true, partialFilterExpression: { inventoryItemId: null } },
)
stockBalanceSchema.index(
  { warehouseId: 1, productId: 1, inventoryItemId: 1 },
  { unique: true, partialFilterExpression: { inventoryItemId: { $type: 'objectId' } } },
)

export const StockBalance = mongoose.models.StockBalance || mongoose.model('StockBalance', stockBalanceSchema)
