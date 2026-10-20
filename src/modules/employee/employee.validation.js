import Joi from 'joi'
import { emailField, listQuery, locationCode, objectId } from '../../common/validation/common.js'
import {
  ACCESS_ROLES,
  ASSIGNMENT_SCOPES,
  EMPLOYMENT_STATUS,
  EMPLOYMENT_TYPES,
  ERP_ROLES,
  LOCATION_TYPES,
} from './employee.constants.js'

const name = Joi.string().trim().min(1).max(120)
const email = emailField
const phone = Joi.string().trim().allow('').max(30)
const department = Joi.string().trim().min(1).max(80)
const jobTitle = Joi.string().trim().min(1).max(80)
const employmentType = Joi.string().valid(...EMPLOYMENT_TYPES)
const joiningDate = Joi.alternatives().try(Joi.valid(null, ''), Joi.date().iso())
const reportsTo = Joi.string().trim().allow('').max(120)
const shopAssignment = Joi.string().trim().allow('').max(120)
const warehouseAccess = Joi.string().trim().allow('').max(120)
const erpRole = Joi.string().valid(...ERP_ROLES)
const createLogin = Joi.string().trim().allow('').max(120)
const notes = Joi.string().trim().allow('').max(2000)
const status = Joi.string().valid(...EMPLOYMENT_STATUS)
const userId = objectId.allow(null, '')

const assignment = Joi.object({
  locationType: Joi.string()
    .valid(...LOCATION_TYPES)
    .required(),
  locationId: objectId.required(),
  scope: Joi.string()
    .valid(...ASSIGNMENT_SCOPES)
    .required(),
  accessRole: Joi.string()
    .valid(...ACCESS_ROLES)
    .required(),
  status: Joi.string().valid('active', 'inactive').default('active'),
})

export const employeeListQuery = listQuery(EMPLOYMENT_STATUS).keys({
  branchId: objectId,
})

export const employeeDetailQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
})

const formFields = {
  email,
  phone,
  department,
  jobTitle,
  employmentType,
  joiningDate,
  reportsTo,
  shopAssignment,
  warehouseAccess,
  erpRole,
  createLogin,
  userId,
  notes,
  assignments: Joi.array().items(assignment),
}

export const createEmployeeBody = Joi.object({
  name: name.required(),
  code: locationCode.required(),
  email: email.required(),
  department: department.required(),
  jobTitle: jobTitle.required(),
  employmentType: employmentType.required(),
  branchId: objectId.required(),
  erpRole: erpRole.required(),
  phone,
  joiningDate,
  reportsTo,
  shopAssignment,
  warehouseAccess,
  createLogin,
  userId,
  status: status.default('active'),
  notes,
  assignments: Joi.array().items(assignment).default([]),
})

export const updateEmployeeBody = Joi.object({
  name,
  code: locationCode,
  branchId: objectId,
  status,
  ...formFields,
  department: Joi.string().trim().allow('').max(80),
  jobTitle: Joi.string().trim().allow('').max(80),
}).min(1)

export const employeeStatusBody = Joi.object({
  status: status.required(),
})
