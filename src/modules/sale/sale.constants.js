export const SALE_STATUS = ['draft', 'approved', 'posted', 'cancelled']

export const SALE_STATUS_LABELS = {
  draft: 'Draft',
  approved: 'Approved',
  posted: 'Posted',
  cancelled: 'Cancelled',
}

/** Register badge when posted with partial collection */
export const SALE_WORKSPACE_STATUS = [...SALE_STATUS, 'part_paid']

export const SALE_WORKSPACE_STATUS_LABELS = {
  ...SALE_STATUS_LABELS,
  part_paid: 'Part paid',
}

export const PAYMENT_STATES = ['unpaid', 'partially_paid', 'paid']

export const PAYMENT_STATE_LABELS = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially paid (PKR)',
  paid: 'Paid',
}

export const SHIPPING_METHODS = ['standard', 'express', 'pickup', 'none']

export const SHIPPING_METHOD_LABELS = {
  standard: 'Standard',
  express: 'Express',
  pickup: 'Customer pickup',
  none: 'No shipment',
}

export const SALE_RETURN_STATUS = ['draft', 'approved', 'posted', 'cancelled']

export const SALE_RETURN_STATUS_LABELS = {
  draft: 'Draft',
  approved: 'Approved',
  posted: 'Posted',
  cancelled: 'Cancelled',
}

export const RETURN_CONDITIONS = ['unopened_resalable', 'opened', 'damaged']

export const RETURN_CONDITION_LABELS = {
  unopened_resalable: 'Unopened - Resalable',
  opened: 'Opened',
  damaged: 'Damaged',
}
