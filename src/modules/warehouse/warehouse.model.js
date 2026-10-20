import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { WAREHOUSE_TYPES, ZONE_USES } from './warehouse.constants.js'

const zoneSchema = new mongoose.Schema(
  {
    code: { type: String, trim: true, uppercase: true, default: '' },
    name: { type: String, trim: true, default: '' },
    use: { type: String, enum: ZONE_USES },
    capacity: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: '' },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
  },
  { _id: true },
)

const warehouseSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    warehouseType: { type: String, enum: WAREHOUSE_TYPES },
    location: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    floorArea: { type: String, trim: true, default: '' },
    storageCapacity: { type: String, trim: true, default: '' },
    managerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    stockAccount: { type: String, trim: true, default: '' },
    defaultZone: { type: String, trim: true, default: '' },
    binTracking: { type: String, trim: true, default: '' },
    negativeStock: { type: String, trim: true, default: '' },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
    zones: { type: [zoneSchema], default: [] },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

warehouseSchema.index({ branchId: 1, status: 1 })
warehouseSchema.index({ status: 1, createdAt: -1 })

export const Warehouse = mongoose.models.Warehouse || mongoose.model('Warehouse', warehouseSchema)
