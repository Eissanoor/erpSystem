import { locationPaths } from './location.js'

export const branchPaths = locationPaths({
  tag: 'Branches',
  basePath: '/api/v1/branches',
  noun: 'Branch',
  plural: 'Branches',
  schema: '#/components/schemas/Branch',
  writeSchema: '#/components/schemas/BranchWrite',
  updateSchema: '#/components/schemas/BranchUpdate',
  permission: 'branch',
  workspace: true,
  statusDescription: 'Sets active or inactive. Warehouses and shops under this branch stay as they are.',
})
