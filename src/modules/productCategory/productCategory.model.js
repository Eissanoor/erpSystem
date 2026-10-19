import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'

const productCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory', default: null },
    description: { type: String, trim: true, default: '' },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { timestamps: true },
)

productCategorySchema.index({ parentId: 1 })
productCategorySchema.index({ status: 1, name: 1 })

export const ProductCategory =
  mongoose.models.ProductCategory || mongoose.model('ProductCategory', productCategorySchema)
