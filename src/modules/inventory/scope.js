import mongoose from 'mongoose'
import { ApiError } from '../../common/utils/ApiError.js'
import { Warehouse } from '../warehouse/warehouse.model.js'

function hasAllBranches(user) {
  return Boolean(user?.permissionCodes?.includes('all_branches'))
}

export async function resolveWarehouses({ warehouseId, branchId }, user) {
  if (warehouseId) {
    const warehouse = await Warehouse.findById(warehouseId).select('_id branchId name code').lean()
    if (!warehouse) {
      throw new ApiError(400, 'Unknown warehouse', [
        { field: 'warehouseId', message: 'Warehouse does not exist' },
      ])
    }
    const branches = (user?.branchIds || []).map(String)
    const assigned = (user?.warehouseIds || []).map(String)
    const outsideBranch = !hasAllBranches(user) && !branches.includes(String(warehouse.branchId))
    const outsideWarehouse =
      !hasAllBranches(user) && assigned.length > 0 && !assigned.includes(String(warehouse._id))
    if (outsideBranch || outsideWarehouse) {
      throw new ApiError(403, 'Warehouse is outside your access', [
        { field: 'warehouseId', message: 'You cannot use this warehouse' },
      ])
    }
    if (branchId && String(warehouse.branchId) !== String(branchId)) {
      throw new ApiError(400, 'Warehouse branch mismatch', [
        { field: 'warehouseId', message: 'Warehouse does not belong to this branch' },
      ])
    }
    return {
      warehouseIds: [warehouse._id],
      branchIds: [warehouse.branchId],
      warehouses: [warehouse],
    }
  }

  const filter = {}
  if (branchId) {
    if (!hasAllBranches(user) && !(user?.branchIds || []).map(String).includes(String(branchId))) {
      throw new ApiError(403, 'Branch is outside your access', [
        { field: 'branchId', message: 'You cannot use this branch' },
      ])
    }
    filter.branchId = branchId
  } else if (!hasAllBranches(user)) {
    filter.branchId = { $in: user?.branchIds || [] }
  }
  if (!hasAllBranches(user) && user?.warehouseIds?.length) {
    filter._id = { $in: user.warehouseIds }
  }

  const rows = await Warehouse.find(filter).select('_id branchId name code').lean()
  return {
    warehouseIds: rows.map((row) => row._id),
    branchIds: [...new Set(rows.map((row) => String(row.branchId)))].map(
      (id) => new mongoose.Types.ObjectId(id),
    ),
    warehouses: rows,
  }
}
