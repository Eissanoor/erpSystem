import mongoose from 'mongoose'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { OWNER_TYPES } from './owner.constants.js'

const interestSchema = new mongoose.Schema(
  {
    entity: { type: String, trim: true, default: '' },
    share: { type: mongoose.Schema.Types.Decimal128, required: true },
    committed: { type: mongoose.Schema.Types.Decimal128, required: true },
    paidIn: { type: mongoose.Schema.Types.Decimal128, required: true },
    effectiveDate: { type: Date, required: true },
  },
  { _id: true },
)

const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    ownerType: { type: String, enum: OWNER_TYPES, required: true },
    identityNo: { type: String, trim: true, default: '' },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    countryOfRegistration: { type: String, trim: true, default: '' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    ownershipPercentage: { type: mongoose.Schema.Types.Decimal128, required: true },
    capitalCommitment: { type: mongoose.Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('0') },
    effectiveDate: { type: Date, default: null },
    capitalAccount: { type: String, trim: true, default: '' },
    capitalAccountId: { type: mongoose.Schema.Types.ObjectId, default: null },
    authorizedSignatory: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    status: { type: String, enum: MASTER_STATUS, default: 'active' },
    interests: { type: [interestSchema], default: [] },
  },
  { timestamps: true },
)

ownerSchema.index({ name: 1 })
ownerSchema.index({ branchId: 1, status: 1 })

export const Owner = mongoose.models.Owner || mongoose.model('Owner', ownerSchema)
