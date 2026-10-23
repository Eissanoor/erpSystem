import mongoose from 'mongoose'
import { Decimal } from 'decimal.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { documentNumber } from '../../common/utils/documentNumber.js'
import { money } from '../../common/utils/money.js'
import { decimalText } from '../product/refs.js'
import { Product } from '../product/product.model.js'
import { Warehouse } from '../warehouse/warehouse.model.js'
import { StockBalance } from './stockBalance.model.js'
import { StockMovement } from './stockMovement.model.js'

function asDecimal(value) {
  return new Decimal(decimalText(value) || '0')
}

function balanceQuery(warehouseId, productId, inventoryItemId) {
  return {
    warehouseId,
    productId,
    inventoryItemId: inventoryItemId || null,
  }
}

export async function apply({
  branchId,
  warehouseId,
  productId,
  inventoryItemId = null,
  quantityIn = '0',
  quantityOut = '0',
  unitCost,
  movementType,
  referenceType = '',
  referenceId = null,
  referenceNumber = '',
  ledgerNumber = '',
  movementDate = new Date(),
  createdBy = null,
  note = '',
  session,
}) {
  const qtyIn = asDecimal(quantityIn)
  const qtyOut = asDecimal(quantityOut)
  if ((qtyIn.gt(0) && qtyOut.gt(0)) || (qtyIn.lte(0) && qtyOut.lte(0))) {
    throw new ApiError(400, 'Invalid movement quantity', [
      { field: 'quantity', message: 'Exactly one of quantityIn or quantityOut must be positive' },
    ])
  }

  const [product, warehouse] = await Promise.all([
    Product.findById(productId).select('status trackBatch trackExpiry costPrice').session(session || null).lean(),
    Warehouse.findById(warehouseId).select('status branchId').session(session || null).lean(),
  ])

  if (!product || product.status !== 'active') {
    throw new ApiError(400, 'Inactive product', [
      { field: 'productId', message: 'Product must be active' },
    ])
  }
  if (!warehouse || warehouse.status !== 'active') {
    throw new ApiError(400, 'Inactive warehouse', [
      { field: 'warehouseId', message: 'Warehouse must be active' },
    ])
  }
  if (String(warehouse.branchId) !== String(branchId)) {
    throw new ApiError(400, 'Warehouse branch mismatch', [
      { field: 'warehouseId', message: 'Warehouse does not belong to this branch' },
    ])
  }
  if ((product.trackBatch || product.trackExpiry) && !inventoryItemId) {
    throw new ApiError(400, 'Inventory item required', [
      { field: 'inventoryItemId', message: 'Batch or expiry tracking requires an inventory item' },
    ])
  }

  const filter = balanceQuery(warehouseId, productId, inventoryItemId)
  let balance = await StockBalance.findOne(filter).session(session || null)
  if (!balance) {
    balance = new StockBalance({
      ...filter,
      quantity: money.toDecimal('0'),
      reservedQuantity: money.toDecimal('0'),
    })
  }

  const onHand = asDecimal(balance.quantity)
  const reserved = asDecimal(balance.reservedQuantity)
  if (qtyOut.gt(0)) {
    const available = Decimal.max(onHand.minus(reserved), 0)
    if (qtyOut.gt(available)) {
      throw new ApiError(400, 'Insufficient stock', [
        { field: 'quantityOut', message: 'Available quantity is not enough for this movement' },
      ])
    }
    balance.quantity = money.toDecimal(onHand.minus(qtyOut).toFixed())
  } else {
    balance.quantity = money.toDecimal(onHand.plus(qtyIn).toFixed())
  }

  const movementNumber = await documentNumber.next('MOV', session)
  const [savedBalance, movement] = await Promise.all([
    balance.save({ session }),
    StockMovement.create(
      [
        {
          movementNumber,
          branchId,
          warehouseId,
          productId,
          inventoryItemId: inventoryItemId || null,
          quantityIn: money.toDecimal(qtyIn.toFixed()),
          quantityOut: money.toDecimal(qtyOut.toFixed()),
          unitCost: money.toDecimal(unitCost ?? decimalText(product.costPrice) ?? '0'),
          movementType,
          referenceType,
          referenceId,
          referenceNumber,
          ledgerNumber,
          movementDate,
          createdBy,
          note,
        },
      ],
      { session },
    ),
  ])

  return { balance: savedBalance, movement: movement[0] }
}

export async function withSession(work) {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const result = await work(session)
    await session.commitTransaction()
    return result
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}
