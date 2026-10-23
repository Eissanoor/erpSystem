export const REORDER_STATES = ['critical', 'low', 'healthy', 'out_of_stock']

export const REORDER_STATE_LABELS = {
  critical: 'Critical',
  low: 'Low',
  healthy: 'Healthy',
  out_of_stock: 'Out of stock',
}

export const ITEM_STATES = ['available', 'hold', 'damaged']

export const ITEM_STATE_LABELS = {
  available: 'Available',
  hold: 'Hold',
  damaged: 'Damaged',
}

export const EXPIRY_RISKS = ['ok', 'expiring_soon', 'quality_check', 'quarantined']

export const EXPIRY_RISK_LABELS = {
  ok: '',
  expiring_soon: 'Expiring soon',
  quality_check: 'Quality check',
  quarantined: 'Quarantined',
}

export const MOVEMENT_TYPE_LABELS = {
  purchase: 'Goods received',
  sale: 'Sale issue',
  transfer_in: 'Transfer received',
  transfer_out: 'Transfer dispatched',
  purchase_return: 'Purchase return',
  sales_return: 'Sales return',
  damage: 'Damage recorded',
  adjustment: 'Cycle count closed',
}

export const MOVEMENT_REGISTER_LABELS = {
  purchase: 'Purchase',
  sale: 'Sale',
  transfer_in: 'Transfer',
  transfer_out: 'Transfer',
  purchase_return: 'Return',
  sales_return: 'Return',
  damage: 'Damage',
  adjustment: 'Adjustment',
}
