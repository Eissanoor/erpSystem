import mongoose from 'mongoose'
import { connectDb } from '../src/config/db.js'
import { money } from '../src/common/utils/money.js'
import { cache } from '../src/common/utils/cache.js'
import { documentNumber, Counter } from '../src/common/utils/documentNumber.js'
import { ApiError } from '../src/common/utils/ApiError.js'
import { errorHandler } from '../src/common/middleware/errorHandler.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function captureError(error) {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
  errorHandler(error, {}, res, () => {})
  return res
}

await connectDb()

const sum = money.add('0.1', '0.2')
assert(sum instanceof mongoose.Types.Decimal128, 'sum is Decimal128')
assert(money.eq(sum, '0.3'), '0.1 + 0.2 equals 0.3')

let loads = 0
const first = await cache.getOrSet('check:once', 60, async () => {
  loads += 1
  return 'value'
})
const second = await cache.getOrSet('check:once', 60, async () => {
  loads += 1
  return 'other'
})
assert(first === 'value' && second === 'value', 'cache returns the stored value')
assert(loads === 1, 'loader runs once before delete')
cache.del('check:once')
await cache.getOrSet('check:once', 60, async () => {
  loads += 1
  return 'fresh'
})
assert(loads === 2, 'loader runs again after delete')

await Counter.deleteMany({ prefix: 'TST' })
const parallel = await Promise.all([documentNumber.next('TST'), documentNumber.next('TST')])
const numbers = [...parallel].sort()
assert(numbers[0] === 'TST-000001', `first number was ${numbers[0]}`)
assert(numbers[1] === 'TST-000002', `second number was ${numbers[1]}`)
const third = await documentNumber.next('TST')
assert(third === 'TST-000003', `third number was ${third}`)
await Counter.deleteMany({ prefix: 'TST' })

const apiError = captureError(
  new ApiError(404, 'Warehouse not found', [{ field: 'warehouseId', message: 'Invalid id' }]),
)
assert(apiError.statusCode === 404, 'ApiError status is preserved')
assert(apiError.body.success === false, 'error success flag is false')
assert(apiError.body.message === 'Warehouse not found', 'ApiError message is preserved')
assert(apiError.body.errors[0].field === 'warehouseId', 'field error is preserved')

await mongoose.disconnect()
console.log('foundation checks passed')
