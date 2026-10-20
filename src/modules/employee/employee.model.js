import mongoose from 'mongoose'
import {
  ACCESS_ROLES,
  ASSIGNMENT_SCOPES,
  EMPLOYMENT_STATUS,
  EMPLOYMENT_TYPES,
  ERP_ROLES,
  LOCATION_TYPES,
} from './employee.constants.js'

const documentSchema = new mongoose.Schema(
  {
    type: { type: String, trim: true, default: '' },
    reference: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
  },
  { _id: false },
)

const assignmentSchema = new mongoose.Schema(
  {
    locationType: { type: String, enum: LOCATION_TYPES, required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    scope: { type: String, enum: ASSIGNMENT_SCOPES, required: true },
    accessRole: { type: String, enum: ACCESS_ROLES, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { _id: true },
)

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    jobTitle: { type: String, trim: true, default: '' },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES },
    joiningDate: { type: Date, default: null },
    reportsTo: { type: String, trim: true, default: '' },
    shopAssignment: { type: String, trim: true, default: '' },
    warehouseAccess: { type: String, trim: true, default: '' },
    erpRole: { type: String, enum: ERP_ROLES },
    createLogin: { type: String, trim: true, default: '' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: EMPLOYMENT_STATUS, default: 'active' },
    document: { type: documentSchema, default: () => ({}) },
    notes: { type: String, trim: true, default: '' },
    assignments: { type: [assignmentSchema], default: [] },
  },
  { timestamps: true },
)

employeeSchema.index({ branchId: 1, status: 1 })
employeeSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } },
)

export const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema)
