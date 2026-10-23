import { Decimal } from 'decimal.js'
import { decimalText } from './refs.js'

export const REORDER_LABELS = {
  critical: 'Critical',
  low: 'Low',
  healthy: 'Healthy',
  out_of_stock: 'Out of stock',
}

function asDecimal(value) {
  return new Decimal(decimalText(value) || '0')
}

export function stockPosition(quantity, reserved) {
  const onHand = asDecimal(quantity)
  const held = asDecimal(reserved)
  return {
    onHand,
    reserved: held,
    available: Decimal.max(onHand.minus(held), 0),
  }
}

export function classifyReorder(available, reorderLevel) {
  const free = available instanceof Decimal ? available : asDecimal(available)
  const level = asDecimal(reorderLevel)
  if (free.lte(0)) return 'out_of_stock'
  if (level.gt(0) && free.lte(level.div(2))) return 'critical'
  if (level.gt(0) && free.lte(level)) return 'low'
  return 'healthy'
}
