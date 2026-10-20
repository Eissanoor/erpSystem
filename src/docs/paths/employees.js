import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'
import { branchIdQuery } from './location.js'

const employee = { $ref: '#/components/schemas/Employee' }

export const employeePaths = {
  '/api/v1/employees': {
    get: {
      tags: ['Employees'],
      operationId: 'listEmployees',
      summary: 'List employees',
      description:
        'Employee register. Search name or code, and filter with branchId and status. meta.summary holds the Employees, Active, Departments, and Pending access cards. The active dropdown omits summary. Employment status and login status are separate.',
      security: bearer,
      parameters: [...listParams, statusParam(['active', 'on_leave', 'inactive']), branchIdQuery],
      responses: {
        200: success('Employees', { type: 'array', items: employee }, {
          list: true,
          meta: { $ref: '#/components/schemas/EmployeePageMeta' },
        }),
        401: error('Authentication required'),
        403: error('Missing employee.read'),
      },
    },
    post: {
      tags: ['Employees'],
      operationId: 'createEmployee',
      summary: 'Create an employee',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/EmployeeWrite' } } },
      },
      responses: {
        201: success('Employee created', employee),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing employee.create'),
        409: error('Employee code already exists'),
      },
    },
  },
  '/api/v1/employees/{id}': {
    get: {
      tags: ['Employees'],
      operationId: 'getEmployee',
      summary: 'Get an employee',
      description:
        'Employee view: profile, the Employees, Active, Departments, and Pending access cards in summary, and the location assignments table. Pass page and limit to page that table. Created on is createdAt and Updated is updatedAt. loginStatus is pending and loginStatusLabel is Invitation pending when no user login is linked.',
      security: bearer,
      parameters: [...idParam, { $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/limit' }],
      responses: {
        200: success('Employee', employee),
        401: error('Authentication required'),
        403: error('Missing employee.read'),
        404: error('Employee not found'),
      },
    },
    patch: {
      tags: ['Employees'],
      operationId: 'updateEmployee',
      summary: 'Update an employee',
      description:
        'Edit employee. Send the form fields. A new document.fileName replaces the attached file, and fields left out of document stay as they are. Omitting assignments leaves the location table as it is. This does not create or change the linked user login.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/EmployeeUpdate' } } },
      },
      responses: {
        200: success('Employee updated', employee),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing employee.update'),
        404: error('Employee not found'),
        409: error('Employee code already exists'),
      },
    },
  },
  '/api/v1/employees/{id}/status': {
    patch: {
      tags: ['Employees'],
      operationId: 'updateEmployeeStatus',
      summary: 'Set employee status',
      description: 'Sets active, on_leave, or inactive. The linked user login is left unchanged.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/EmployeeStatus' } } },
      },
      responses: {
        200: success('Employee updated', employee),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing employee.update'),
        404: error('Employee not found'),
      },
    },
  },
}
