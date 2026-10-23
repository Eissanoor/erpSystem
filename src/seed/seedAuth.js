import { env } from '../config/env.js'
import { hashPassword } from '../modules/auth/password.js'
import { clearAuthUsersForRole } from '../modules/auth/auth.cache.js'
import { Permission } from '../modules/permission/permission.model.js'
import { Role } from '../modules/role/role.model.js'
import { User } from '../modules/user/user.model.js'
import { Branch } from '../modules/branch/branch.model.js'
import { Warehouse } from '../modules/warehouse/warehouse.model.js'
import { Shop } from '../modules/shop/shop.model.js'
import { Employee } from '../modules/employee/employee.model.js'
import { Owner } from '../modules/owner/owner.model.js'
import { Partnership } from '../modules/partnership/partnership.model.js'
import { Currency } from '../modules/currency/currency.model.js'
import { ProductCategory } from '../modules/productCategory/productCategory.model.js'
import { QuantityUnit } from '../modules/quantityUnit/quantityUnit.model.js'
import { PackingUnit } from '../modules/packingUnit/packingUnit.model.js'
import { Product } from '../modules/product/product.model.js'
import { StockBalance } from '../modules/inventory/stockBalance.model.js'

const MODULES = [
  'user',
  'role',
  'permission',
  'branch',
  'warehouse',
  'shop',
  'employee',
  'owner',
  'partnership',
  'currency',
  'product_category',
  'quantity_unit',
  'packing_unit',
  'product',
]
const ACTIONS = ['create', 'read', 'update']

export const SEEDED_PERMISSIONS = [
  ...MODULES.flatMap((module) =>
    ACTIONS.map((action) => ({
      module,
      action,
      code: `${module}.${action}`,
      description: `${action} ${module}`,
      status: 'active',
    })),
  ),
  {
    module: 'access',
    action: 'all',
    code: 'all_branches',
    description: 'Access every branch and warehouse',
    status: 'active',
  },
]

export async function seedAuth() {
  if (!env.seedAdminEmail) {
    throw new Error('Set SEED_ADMIN_EMAIL before starting')
  }

  await Promise.all([
    Permission.init(),
    Role.init(),
    User.init(),
    Branch.init(),
    Warehouse.init(),
    Shop.init(),
    Employee.init(),
    Owner.init(),
    Partnership.init(),
    Currency.init(),
    ProductCategory.init(),
    QuantityUnit.init(),
    PackingUnit.init(),
    Product.init(),
    StockBalance.init(),
  ])

  await Permission.bulkWrite(
    SEEDED_PERMISSIONS.map((permission) => ({
      updateOne: {
        filter: { code: permission.code },
        update: { $set: permission },
        upsert: true,
      },
    })),
  )

  const permissions = await Permission.find().select('_id')
  const role = await Role.findOneAndUpdate(
    { code: 'super_admin' },
    {
      $set: {
        name: 'Super Admin',
        code: 'super_admin',
        permissionIds: permissions.map((permission) => permission._id),
        status: 'active',
      },
    },
    { new: true, upsert: true },
  )

  let admin = await User.findOne({ email: env.seedAdminEmail }).select('+passwordHash')
  if (!admin) {
    if (!env.seedAdminPassword || env.seedAdminPassword.length < 8) {
      throw new Error('Set SEED_ADMIN_PASSWORD (min 8 characters) before starting')
    }
    admin = await User.create({
      name: env.seedAdminName,
      email: env.seedAdminEmail,
      passwordHash: await hashPassword(env.seedAdminPassword),
      roleIds: [role._id],
      branchIds: [],
      warehouseIds: [],
      status: 'active',
    })
  } else if (!admin.roleIds.some((id) => String(id) === String(role._id))) {
    admin.roleIds.push(role._id)
    await admin.save()
  }

  await clearAuthUsersForRole(role._id)
  console.log(`Auth seed ready (${env.seedAdminEmail})`)
  return { role, admin }
}
