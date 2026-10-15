import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { scopeToBranches } from '../src/common/utils/scopeToBranches.js'

const LIMITED_EMAIL = 'limited.check@gulzar.local'
const LIMITED_PASSWORD = 'LimitedPass1'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function scopeChecks() {
  const open = scopeToBranches({ status: 'active' }, { permissionCodes: ['all_branches'], branchIds: [] })
  assert(open.status === 'active' && open.branchId === undefined, 'all_branches leaves the filter open')

  const scoped = scopeToBranches({}, { permissionCodes: ['user.read'], branchIds: ['a', 'b'] })
  assert(scoped.branchId.$in.length === 2, 'missing branch filter is limited to the user branches')

  const kept = scopeToBranches({ branchId: 'a' }, { permissionCodes: [], branchIds: ['a', 'b'] })
  assert(kept.branchId === 'a', 'an allowed branch id is kept')

  const blocked = scopeToBranches({ branchId: 'c' }, { permissionCodes: [], branchIds: ['a'] })
  assert(Array.isArray(blocked.branchId.$in) && blocked.branchId.$in.length === 0, 'a foreign branch matches nothing')
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function client(base) {
  return async function request(method, path, { token, body } = {}) {
    const headers = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (token) headers.authorization = `Bearer ${token}`
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await response.json()
    return { status: response.status, json }
  }
}

function assertStatus(response, status, label) {
  if (response.status !== status) {
    throw new Error(`${label}: expected ${status}, got ${response.status} ${JSON.stringify(response.json)}`)
  }
}

async function ensureLimitedRole(request, token) {
  const created = await request('POST', '/api/v1/roles', {
    token,
    body: { name: 'Check Limited', code: 'check_limited', permissionIds: [], status: 'active' },
  })
  if (created.status === 201) return created.json.data

  const listed = await request('GET', '/api/v1/roles?search=check_limited&limit=20', { token })
  assertStatus(listed, 200, 'list check role')
  const role = listed.json.data.find((item) => item.code === 'check_limited')
  assert(role, 'check_limited role was not found')
  const updated = await request('PATCH', `/api/v1/roles/${role._id}`, {
    token,
    body: { permissionIds: [], status: 'active' },
  })
  assertStatus(updated, 200, 'clear check role')
  return updated.json.data
}

async function ensureLimitedUser(request, token, roleId) {
  const body = {
    name: 'Limited Check',
    email: LIMITED_EMAIL,
    password: LIMITED_PASSWORD,
    roleIds: [roleId],
    status: 'active',
  }
  const created = await request('POST', '/api/v1/users', { token, body })
  if (created.status === 201) return created.json.data

  const listed = await request('GET', `/api/v1/users?search=${encodeURIComponent(LIMITED_EMAIL)}&limit=20`, { token })
  assertStatus(listed, 200, 'list check user')
  const user = listed.json.data.find((item) => item.email === LIMITED_EMAIL)
  assert(user, 'limited check user was not found')
  const updated = await request('PATCH', `/api/v1/users/${user._id}`, {
    token,
    body: { password: LIMITED_PASSWORD, status: 'active' },
  })
  assertStatus(updated, 200, 'reactivate check user')
  const access = await request('PATCH', `/api/v1/users/${user._id}/access`, {
    token,
    body: { roleIds: [roleId] },
  })
  assertStatus(access, 200, 'reset check user role')
  return access.json.data
}

scopeChecks()

let server
try {
  await connectDb()
  await seedAuth()
  const app = createApp()
  server = await listen(app)
  const request = client(`http://127.0.0.1:${server.address().port}`)

  const login = await request('POST', '/api/v1/auth/login', {
    body: { email: env.seedAdminEmail, password: env.seedAdminPassword },
  })
  assertStatus(login, 200, 'admin login')
  assert(login.json.data.accessToken && login.json.data.refreshToken, 'login returns both tokens')
  assert(login.json.data.user.passwordHash === undefined, 'login user omits passwordHash')
  assert(login.json.data.user.permissionCodes.includes('user.read'), 'admin can read users')
  assert(login.json.data.user.permissionCodes.includes('all_branches'), 'admin has all branches')
  const adminToken = login.json.data.accessToken

  const wrong = await request('POST', '/api/v1/auth/login', {
    body: { email: env.seedAdminEmail, password: `${env.seedAdminPassword}__wrong` },
  })
  assertStatus(wrong, 401, 'wrong password')
  assert(wrong.json.success === false, 'wrong password success flag')
  assert(typeof wrong.json.message === 'string' && wrong.json.message.length > 0, 'wrong password message')
  assert(Array.isArray(wrong.json.errors), 'wrong password errors array')

  const me = await request('GET', '/api/v1/auth/me', { token: adminToken })
  assertStatus(me, 200, 'me')
  assert(me.json.data.email === env.seedAdminEmail, 'me returns the admin email')

  const anonymous = await request('GET', '/api/v1/auth/me')
  assertStatus(anonymous, 401, 'me without token')

  const refreshed = await request('POST', '/api/v1/auth/refresh', {
    body: { refreshToken: login.json.data.refreshToken },
  })
  assertStatus(refreshed, 200, 'refresh')
  const meRefreshed = await request('GET', '/api/v1/auth/me', { token: refreshed.json.data.accessToken })
  assertStatus(meRefreshed, 200, 'me after refresh')

  const loggedOut = await request('POST', '/api/v1/auth/logout', { token: adminToken })
  assertStatus(loggedOut, 200, 'logout')

  const role = await ensureLimitedRole(request, adminToken)
  const limitedUser = await ensureLimitedUser(request, adminToken, role._id)
  assert(limitedUser.passwordHash === undefined && limitedUser.password === undefined, 'created user omits password')

  const limitedLogin = await request('POST', '/api/v1/auth/login', {
    body: { email: LIMITED_EMAIL, password: LIMITED_PASSWORD },
  })
  assertStatus(limitedLogin, 200, 'limited login')
  const limitedToken = limitedLogin.json.data.accessToken

  const forbidden = await request('GET', '/api/v1/users', { token: limitedToken })
  assertStatus(forbidden, 403, 'user without user.read')
  assert(forbidden.json.success === false, '403 success flag')

  const permissions = await request('GET', '/api/v1/permissions?search=user.read&limit=20', { token: adminToken })
  assertStatus(permissions, 200, 'list permissions')
  const userRead = permissions.json.data.find((item) => item.code === 'user.read')
  assert(userRead, 'user.read permission exists')

  const granted = await request('PATCH', `/api/v1/roles/${role._id}`, {
    token: adminToken,
    body: { permissionIds: [userRead._id] },
  })
  assertStatus(granted, 200, 'grant user.read')

  const meLimited = await request('GET', '/api/v1/auth/me', { token: limitedToken })
  assertStatus(meLimited, 200, 'me after role change')
  assert(meLimited.json.data.permissionCodes.includes('user.read'), 'cache reload shows user.read')

  const allowed = await request('GET', '/api/v1/users', { token: limitedToken })
  assertStatus(allowed, 200, 'user.read after cache delete')
  assert(Array.isArray(allowed.json.data), 'user list is an array')

  const stillForbidden = await request('GET', '/api/v1/roles', { token: limitedToken })
  assertStatus(stillForbidden, 403, 'role.read stays denied')

  const inactive = await request('PATCH', `/api/v1/users/${limitedUser._id}`, {
    token: adminToken,
    body: { status: 'inactive' },
  })
  assertStatus(inactive, 200, 'inactivate check user')
  const inactiveLogin = await request('POST', '/api/v1/auth/login', {
    body: { email: LIMITED_EMAIL, password: LIMITED_PASSWORD },
  })
  assertStatus(inactiveLogin, 403, 'inactive login')

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  const spec = specRes.json
  assert(spec.components.securitySchemes.bearerAuth.scheme === 'bearer', 'bearerAuth scheme')
  const requiredPaths = [
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/api/v1/auth/logout',
    '/api/v1/auth/me',
    '/api/v1/users',
    '/api/v1/users/{id}',
    '/api/v1/users/{id}/access',
    '/api/v1/roles',
    '/api/v1/roles/{id}',
    '/api/v1/permissions',
  ]
  for (const path of requiredPaths) {
    assert(spec.paths[path], `openapi missing ${path}`)
  }
  assert(!spec.paths['/api/v1/auth/login'].post.security, 'login stays public')
  assert(spec.paths['/api/v1/users'].get.security[0].bearerAuth, 'users require bearerAuth')
  assert(/expir/i.test(spec.paths['/api/v1/auth/logout'].post.description), 'logout documents token expiry')

  console.log('auth checks passed')
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
}
