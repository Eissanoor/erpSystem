import mongoose from 'mongoose'

export const DAMAGE_TYPES = ['broken', 'expired', 'leaked', 'defective', 'lost', 'other']
export const DAMAGE_STATUS = ['draft', 'approved', 'cancelled']

const productDamageSchema = new mongoose.Schema(
  {
    damageNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    damageType: { type: String, enum: DAMAGE_TYPES, required: true },
    quantity: { type: mongoose.Schema.Types.Decimal128, required: true },
    unitCost: { type: mongoose.Schema.Types.Decimal128, required: true },
    status: { type: String, enum: DAMAGE_STATUS, default: 'draft' },
    damageDate: { type: Date, required: true },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

productDamageSchema.index({ status: 1, damageDate: 1 })
productDamageSchema.index({ warehouseId: 1, status: 1 })

export const ProductDamage =
  mongoose.models.ProductDamage || mongoose.model('ProductDamage', productDamageSchema)
