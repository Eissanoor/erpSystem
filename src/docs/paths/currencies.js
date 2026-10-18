import { locationPaths } from './location.js'

export const currencyPaths = locationPaths({
  tag: 'Currencies',
  basePath: '/api/v1/currencies',
  noun: 'Currency',
  plural: 'Currencies',
  schema: '#/components/schemas/Currency',
  writeSchema: '#/components/schemas/CurrencyWrite',
  updateSchema: '#/components/schemas/CurrencyUpdate',
  permission: 'currency',
  statusDescription: 'Sets active or inactive. The base-currency flag stays as it is.',
})
