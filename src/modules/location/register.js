import { scopeToBranches } from '../../common/utils/scopeToBranches.js'
import { Branch } from '../branch/branch.model.js'
import { Shop } from '../shop/shop.model.js'
import { Warehouse } from '../warehouse/warehouse.model.js'

function branchScope(user) {
  if (user?.permissionCodes?.includes('all_branches')) return {}
  const allowed = [...new Set((user?.branchIds || []).map(String))]
  return { _id: { $in: allowed } }
}

export async function organizationSummary(user) {
  const branches = branchScope(user)
  const children = scopeToBranches({}, user)
  const [branchTotal, branchActive, warehouseTotal, warehouseActive, shopTotal, shopBranches] =
    await Promise.all([
      Branch.countDocuments(branches),
      Branch.countDocuments({ ...branches, status: 'active' }),
      Warehouse.countDocuments(children),
      Warehouse.countDocuments({ ...children, status: 'active' }),
      Shop.countDocuments(children),
      Shop.distinct('branchId', children),
    ])

  return {
    branches: { total: branchTotal, active: branchActive },
    shops: { total: shopTotal, branchCount: shopBranches.length },
    warehouses: { total: warehouseTotal, active: warehouseActive },
  }
}

export async function attachBranchUsage(branches) {
  const ids = branches.map((branch) => branch._id)
  if (!ids.length) return branches
  const match = { branchId: { $in: ids } }
  const [warehouses, shops] = await Promise.all([
    Warehouse.aggregate([{ $match: match }, { $group: { _id: '$branchId', count: { $sum: 1 } } }]),
    Shop.aggregate([{ $match: match }, { $group: { _id: '$branchId', count: { $sum: 1 } } }]),
  ])
  const warehouseCount = new Map(warehouses.map((row) => [String(row._id), row.count]))
  const shopCount = new Map(shops.map((row) => [String(row._id), row.count]))
  return branches.map((branch) => ({
    ...branch,
    warehouseCount: warehouseCount.get(String(branch._id)) || 0,
    shopCount: shopCount.get(String(branch._id)) || 0,
  }))
}

export async function shopRegisterSummary(user) {
  const filter = scopeToBranches({}, user)
  const [total, active, branchIds] = await Promise.all([
    Shop.countDocuments(filter),
    Shop.countDocuments({ ...filter, status: 'active' }),
    Shop.distinct('branchId', filter),
  ])
  return {
    shops: { total, active },
    branches: branchIds.length,
    assignedStaff: 0,
  }
}

export async function childLocations(branchId, user) {
  const filter = user ? scopeToBranches({ branchId }, user) : { branchId }
  const [warehouses, shops] = await Promise.all([
    Warehouse.find(filter).select('name code managerId status').sort({ code: 1 }).lean(),
    Shop.find(filter).select('name code managerId status').sort({ code: 1 }).lean(),
  ])
  return [
    ...warehouses.map((row) => ({ ...row, type: 'warehouse' })),
    ...shops.map((row) => ({ ...row, type: 'shop' })),
  ]
}
