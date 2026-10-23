import mongoose from 'mongoose'
import { LEDGER_SOURCE_TYPES } from './payables.constants.js'

const supplierLedgerEntrySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
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

supplierLedgerEntrySchema.index({ supplierId: 1, entryDate: 1, createdAt: 1 })
supplierLedgerEntrySchema.index({ branchId: 1, supplierId: 1, entryDate: -1 })

export const SupplierLedgerEntry =
  mongoose.models.SupplierLedgerEntry ||
  mongoose.model('SupplierLedgerEntry', supplierLedgerEntrySchema)
