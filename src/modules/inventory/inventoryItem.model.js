import mongoose from 'mongoose'
import { ITEM_STATES } from './inventory.constants.js'

const inventoryItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    batchNumber: { type: String, trim: true, uppercase: true, default: '' },
    serialNumber: { type: String, trim: true, uppercase: true, default: '' },
    expiryDate: { type: Date, default: null },
    unitCost: { type: mongoose.Schema.Types.Decimal128, required: true },
    state: { type: String, enum: ITEM_STATES, default: 'available' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

inventoryItemSchema.index({ warehouseId: 1, productId: 1, batchNumber: 1 })
inventoryItemSchema.index({ warehouseId: 1, state: 1 })
inventoryItemSchema.index({ serialNumber: 1 }, { sparse: true })
inventoryItemSchema.index({ expiryDate: 1, state: 1 })
inventoryItemSchema.index({ status: 1, warehouseId: 1 })

export const InventoryItem =
  mongoose.models.InventoryItem || mongoose.model('InventoryItem', inventoryItemSchema)
