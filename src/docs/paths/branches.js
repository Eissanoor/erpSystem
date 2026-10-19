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
  detailDescription:
    'Branch view for one branch: profile, the organization cards in summary, and the shops and warehouses table in locations. Pass page and limit to page that table.',
  detailParameters: [
    { $ref: '#/components/parameters/page' },
    { $ref: '#/components/parameters/limit' },
  ],
  statusDescription: 'Sets active or inactive. Warehouses and shops under this branch stay as they are.',
})
