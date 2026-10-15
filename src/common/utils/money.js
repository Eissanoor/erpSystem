import mongoose from 'mongoose'
import { Decimal } from 'decimal.js'
import { ApiError } from './ApiError.js'

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

function asDecimal(value) {
  if (value instanceof mongoose.Types.Decimal128) {
    return new Decimal(value.toString())
  }
  if (value instanceof Decimal) return value
  const text = String(value ?? '').trim()
  if (!DECIMAL_PATTERN.test(text)) {
    throw new ApiError(400, 'Invalid decimal value', [
      { field: 'amount', message: 'Amount must be a decimal string' },
    ])
  }
  return new Decimal(text)
}

export const money = {
  toDecimal(value) {
    return mongoose.Types.Decimal128.fromString(asDecimal(value).toFixed())
  },

  add(left, right) {
    return mongoose.Types.Decimal128.fromString(asDecimal(left).plus(asDecimal(right)).toFixed())
  },

  eq(left, right) {
    return asDecimal(left).eq(asDecimal(right))
  },
}
