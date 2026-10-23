import mongoose from 'mongoose'
import { LEDGER_SOURCE_TYPES } from './receivables.constants.js'

const customerLedgerEntrySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    currencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Currency', required: true },
    entryDate: { type: Date, required: true },
    sourceType: { type: String, enum: LEDGER_SOURCE_TYPES, required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sourceNumber: { type: String, required: true, trim: true, uppercase: true },
    debit: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    credit: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
    },
    balance: { type: mongoose.Schema.Types.Decimal128, required: true },
    description: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

customerLedgerEntrySchema.index({ customerId: 1, entryDate: 1, createdAt: 1 })
customerLedgerEntrySchema.index({ branchId: 1, customerId: 1, entryDate: -1 })

export const CustomerLedgerEntry =
  mongoose.models.CustomerLedgerEntry ||
  mongoose.model('CustomerLedgerEntry', customerLedgerEntrySchema)
