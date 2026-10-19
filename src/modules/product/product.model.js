import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'

function emptyToUndefined(value) {
  if (value == null) return undefined
  const text = String(value).trim()
  return text || undefined
}

const productSchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory', required: true },
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    barcode: { type: String, trim: true, set: emptyToUndefined },
    description: { type: String, trim: true, default: '' },
    quantityUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuantityUnit', required: true },
    packingUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'PackingUnit', default: null },
    costPrice: { type: mongoose.Schema.Types.Decimal128, required: true },
    salePrice: { type: mongoose.Schema.Types.Decimal128, required: true },
    reorderLevel: { type: mongoose.Schema.Types.Decimal128, required: true },
    trackBatch: { type: Boolean, default: false },
    trackExpiry: { type: Boolean, default: false },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { timestamps: true },
)

productSchema.index({ barcode: 1 }, { unique: true, sparse: true })
productSchema.index({ categoryId: 1, status: 1 })
productSchema.index({ name: 1 })
productSchema.index({ status: 1, createdAt: -1 })

export const Product = mongoose.models.Product || mongoose.model('Product', productSchema)
