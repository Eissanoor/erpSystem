import mongoose from 'mongoose'
import { AGREEMENT_TYPES, PARTNERSHIP_STATUS } from './partnership.constants.js'

const partnerSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true },
    contribution: { type: mongoose.Schema.Types.Decimal128, required: true },
    ownership: { type: mongoose.Schema.Types.Decimal128, required: true },
    profitShare: { type: mongoose.Schema.Types.Decimal128, required: true },
    lossShare: { type: mongoose.Schema.Types.Decimal128, required: true },
  },
  { _id: true },
)

const partnershipSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    agreementType: { type: String, enum: AGREEMENT_TYPES, required: true },
    effectiveDate: { type: Date, required: true },
    startDate: { type: Date, required: true },
    reviewDate: { type: Date, default: null },
    capitalCommitment: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    settlementFrequency: { type: String, trim: true, default: '' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    managingPartner: { type: String, required: true, trim: true },
    partnerRoster: { type: String, required: true, trim: true },
    profitAllocation: { type: String, required: true, trim: true },
    lossAllocation: { type: String, required: true, trim: true },
    approvalAuthority: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    status: { type: String, enum: PARTNERSHIP_STATUS, default: 'active' },
    partners: { type: [partnerSchema], default: [] },
  },
  { timestamps: true },
)

partnershipSchema.index({ name: 1 })
partnershipSchema.index({ branchId: 1, status: 1 })

export const Partnership = mongoose.models.Partnership || mongoose.model('Partnership', partnershipSchema)
