import mongoose from 'mongoose'

export const TRANSFER_STATUS = ['draft', 'in_transit', 'received', 'cancelled']

const transferLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
    batchNumber: { type: String, trim: true, uppercase: true, default: '' },
    quantityRequested: { type: mongoose.Schema.Types.Decimal128, required: true },
    quantityShipped: { type: mongoose.Schema.Types.Decimal128, default: null },
    quantityReceived: { type: mongoose.Schema.Types.Decimal128, default: null },
    unitCost: { type: mongoose.Schema.Types.Decimal128, required: true },
  },
  { _id: true },
)

const warehouseTransferSchema = new mongoose.Schema(
  {
    transferNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    sourceBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    sourceWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    destinationBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    destinationWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    reason: { type: String, trim: true, default: '' },
    vehicle: { type: String, trim: true, default: '' },
    expectedDate: { type: Date, default: null },
    status: { type: String, enum: TRANSFER_STATUS, default: 'draft' },
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    draftedAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: '' },
    lines: { type: [transferLineSchema], default: [] },
  },
  { timestamps: true },
)

warehouseTransferSchema.index({ status: 1, createdAt: -1 })
warehouseTransferSchema.index({ sourceWarehouseId: 1, status: 1 })
warehouseTransferSchema.index({ destinationWarehouseId: 1, status: 1 })

export const WarehouseTransfer =
  mongoose.models.WarehouseTransfer || mongoose.model('WarehouseTransfer', warehouseTransferSchema)
