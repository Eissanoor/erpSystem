import { compare, hash } from 'bcryptjs'

const BCRYPT_COST = 12

export function hashPassword(password) {
  return hash(password, BCRYPT_COST)
}

export function checkPassword(password, passwordHash) {
  return compare(password, passwordHash)
}
