import mongoose from 'mongoose'

const purchaseItemSchema = new mongoose.Schema(
  {
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    packingUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'PackingUnit', default: null },
    packingLabel: { type: String, trim: true, default: '' },
    packingFactor: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('1'),
    },
    quantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    stockQuantity: { type: mongoose.Schema.Types.Decimal128, required: true },
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
    receivedQuantity: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    returnedQuantity: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
  },
  { timestamps: true },
)

purchaseItemSchema.index({ productId: 1 })

export const PurchaseItem =
  mongoose.models.PurchaseItem || mongoose.model('PurchaseItem', purchaseItemSchema)
