import { authPaths } from './paths/auth.js'
import { branchPaths } from './paths/branches.js'
import { permissionPaths } from './paths/permissions.js'
import { rolePaths } from './paths/roles.js'
import { shopPaths } from './paths/shops.js'
import { userPaths } from './paths/users.js'
import { warehousePaths } from './paths/warehouses.js'
import { currencyPaths } from './paths/currencies.js'
import { packingUnitPaths } from './paths/packingUnits.js'
import { productCategoryPaths } from './paths/productCategories.js'
import { productPaths } from './paths/products.js'
import { quantityUnitPaths } from './paths/quantityUnits.js'

const objectId = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }
const objectIdArray = { type: 'array', items: objectId }

export function buildOpenApiSpec(serverUrl = '/') {
  return {
    openapi: '3.0.3',
    info: {
      title: 'ERP Gulzar API',
      version: '0.5.0',
      description:
        'Single-client ERP. Branch is the top-level location. Protected routes use bearerAuth. Logout does not revoke the access token before JWT_ACCESS_EXPIRES (default 15 minutes).',
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'Health', description: 'Service health' },
      { name: 'Auth', description: 'Login, refresh, and the current user' },
      { name: 'Users', description: 'User accounts and access' },
      { name: 'Roles', description: 'Permission groups' },
      { name: 'Permissions', description: 'Module action codes' },
      { name: 'Branches', description: 'Top-level locations' },
      { name: 'Warehouses', description: 'Inventory locations under a branch' },
      { name: 'Shops', description: 'Sales locations under a branch' },
      { name: 'Currencies', description: 'Global currency master' },
      { name: 'Product categories', description: 'Product classification tree' },
      { name: 'Quantity units', description: 'Base measurement units' },
      { name: 'Packing units', description: 'Packs converted to a quantity unit' },
      { name: 'Products', description: 'Product master, without stock quantities' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Database health',
          responses: {
            200: {
              description: 'Database is up',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessEnvelope' },
                },
              },
            },
          },
        },
      },
      ...authPaths,
      ...userPaths,
      ...rolePaths,
      ...permissionPaths,
      ...branchPaths,
      ...warehousePaths,
      ...shopPaths,
      ...currencyPaths,
      ...productCategoryPaths,
      ...quantityUnitPaths,
      ...packingUnitPaths,
      ...productPaths,
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Access token from POST /api/v1/auth/login. Logout does not revoke this token; it stays valid until it expires (JWT_ACCESS_EXPIRES, default 15 minutes). Instant revoke is a stage 12 denylist.',
        },
      },
      parameters: {
        page: {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        limit: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        search: {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
        },
        sort: {
          name: 'sort',
          in: 'query',
          description: 'Allow-listed field. Prefix with - for descending.',
          schema: { type: 'string' },
        },
        id: {
          name: 'id',
          in: 'path',
          required: true,
          schema: objectId,
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          required: ['success', 'message', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: {},
            meta: { $ref: '#/components/schemas/PageMeta' },
          },
        },
        PageMeta: {
          type: 'object',
          required: ['page', 'limit', 'total'],
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
          },
        },
        OrganizationSummary: {
          type: 'object',
          properties: {
            branches: {
              type: 'object',
              properties: {
                total: { type: 'integer', example: 4 },
                active: { type: 'integer', example: 3 },
              },
            },
            shops: {
              type: 'object',
              properties: {
                total: { type: 'integer', example: 8 },
                branchCount: { type: 'integer', description: 'Branches that have at least one shop', example: 3 },
              },
            },
            warehouses: {
              type: 'object',
              properties: {
                total: { type: 'integer', example: 5 },
                active: { type: 'integer' },
              },
            },
          },
        },
        OrganizationPageMeta: {
          allOf: [
            { $ref: '#/components/schemas/PageMeta' },
            {
              type: 'object',
              properties: {
                summary: { $ref: '#/components/schemas/OrganizationSummary' },
              },
            },
          ],
        },
        LocationChild: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string', example: 'Main Warehouse' },
            type: { type: 'string', enum: ['warehouse', 'shop'] },
            code: { type: 'string', example: 'WH-001' },
            managerId: { ...objectId, nullable: true, description: 'Custodian. Null until Employee exists.' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        ErrorEnvelope: {
          type: 'object',
          required: ['success', 'message', 'errors'],
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        RefreshRequest: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        AuthUser: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            status: { type: 'string', enum: ['active', 'locked', 'inactive'] },
            employeeId: { ...objectId, nullable: true },
            roleIds: objectIdArray,
            branchIds: objectIdArray,
            warehouseIds: objectIdArray,
            permissionCodes: { type: 'array', items: { type: 'string' }, example: ['user.read', 'all_branches'] },
            lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        AuthSession: {
          type: 'object',
          required: ['user', 'accessToken', 'refreshToken'],
          properties: {
            user: { $ref: '#/components/schemas/AuthUser' },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        RoleRef: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            code: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            status: { type: 'string', enum: ['active', 'locked', 'inactive'] },
            employeeId: { ...objectId, nullable: true },
            roleIds: { type: 'array', items: { $ref: '#/components/schemas/RoleRef' } },
            branchIds: objectIdArray,
            warehouseIds: objectIdArray,
            lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        UserCreate: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8, writeOnly: true },
            phone: { type: 'string' },
            employeeId: { ...objectId, nullable: true },
            roleIds: objectIdArray,
            branchIds: objectIdArray,
            warehouseIds: objectIdArray,
            status: { type: 'string', enum: ['active', 'locked', 'inactive'] },
          },
        },
        UserUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8, writeOnly: true },
            phone: { type: 'string' },
            employeeId: { ...objectId, nullable: true },
            status: { type: 'string', enum: ['active', 'locked', 'inactive'] },
            roleIds: objectIdArray,
            branchIds: objectIdArray,
            warehouseIds: objectIdArray,
          },
        },
        PermissionRef: {
          type: 'object',
          properties: {
            _id: objectId,
            module: { type: 'string' },
            action: { type: 'string' },
            code: { type: 'string' },
          },
        },
        Role: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            code: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            permissionIds: { type: 'array', items: { $ref: '#/components/schemas/PermissionRef' } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        RoleWrite: {
          type: 'object',
          required: ['name', 'code'],
          properties: {
            name: { type: 'string' },
            code: { type: 'string' },
            permissionIds: objectIdArray,
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        RoleUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            code: { type: 'string' },
            permissionIds: objectIdArray,
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        MasterStatus: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        BranchRef: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            code: { type: 'string' },
            phone: { type: 'string', description: 'On warehouse and shop detail' },
            location: { type: 'string' },
            address: { type: 'string', description: 'On warehouse and shop detail' },
          },
        },
        Branch: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            code: { type: 'string', example: 'KHI' },
            branchType: { type: 'string', enum: ['operating', 'head_office', 'regional', 'retail', 'wholesale'] },
            branchTypeLabel: { type: 'string', example: 'Operating branch', description: 'Label for the detail page' },
            openingDate: { type: 'string', format: 'date-time', nullable: true },
            phone: { type: 'string' },
            email: { type: 'string' },
            location: { type: 'string', description: 'City or district shown in the register, for example City Center' },
            address: { type: 'string', description: 'Operating address. Omitted from lists.' },
            managerId: { ...objectId, nullable: true, description: 'Null until Employee exists. The register shows Unassigned.' },
            defaultWarehouseId: {
              nullable: true,
              type: 'object',
              description: 'Warehouse under this branch. Null on create until one exists.',
              properties: { _id: objectId, name: { type: 'string' }, code: { type: 'string' } },
            },
            defaultShopId: {
              nullable: true,
              type: 'object',
              properties: { _id: objectId, name: { type: 'string' }, code: { type: 'string' } },
            },
            costCentre: { type: 'string' },
            documentPrefix: { type: 'string', description: 'Stored uppercase' },
            document: {
              type: 'object',
              properties: {
                type: { type: 'string', example: 'Registration / lease' },
                reference: { type: 'string' },
                fileName: { type: 'string', description: 'Attached PDF, JPG, or PNG. Send a new name to replace it.' },
              },
            },
            notes: { type: 'string', description: 'Internal notes. Omitted from lists.' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            warehouseCount: { type: 'integer', description: 'Shops and warehouses of this branch' },
            shopCount: { type: 'integer' },
            summary: { $ref: '#/components/schemas/OrganizationSummary' },
            locations: {
              type: 'array',
              description: 'Shops and warehouses table. Warehouses first, then shops, each by code. name is the Location column. managerId is the Custodian.',
              items: { $ref: '#/components/schemas/LocationChild' },
            },
            locationsMeta: { $ref: '#/components/schemas/PageMeta' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        BranchWrite: {
          type: 'object',
          required: ['name', 'code', 'branchType', 'address'],
          properties: {
            name: { type: 'string' },
            code: { type: 'string', description: 'Stored uppercase' },
            branchType: { type: 'string', enum: ['operating', 'head_office', 'regional', 'retail', 'wholesale'] },
            openingDate: { type: 'string', format: 'date', nullable: true },
            phone: { type: 'string' },
            email: { type: 'string' },
            location: { type: 'string', description: 'City or district' },
            address: { type: 'string' },
            managerId: { type: 'string', nullable: true, description: 'Null until Employee exists' },
            defaultWarehouseId: { ...objectId, nullable: true, description: 'Must already belong to this branch, so it stays empty on add' },
            defaultShopId: { ...objectId, nullable: true },
            status: { type: 'string', enum: ['active', 'inactive'] },
            costCentre: { type: 'string' },
            documentPrefix: { type: 'string', description: 'Stored uppercase' },
            document: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                reference: { type: 'string' },
                fileName: { type: 'string', description: 'Attached PDF, JPG, or PNG. Send a new name to replace it.' },
              },
            },
            notes: { type: 'string' },
          },
        },
        BranchUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            code: { type: 'string' },
            branchType: { type: 'string', enum: ['operating', 'head_office', 'regional', 'retail', 'wholesale'] },
            openingDate: { type: 'string', format: 'date', nullable: true },
            phone: { type: 'string' },
            email: { type: 'string' },
            location: { type: 'string' },
            address: { type: 'string' },
            managerId: { type: 'string', nullable: true },
            defaultWarehouseId: { ...objectId, nullable: true },
            defaultShopId: { ...objectId, nullable: true },
            status: { type: 'string', enum: ['active', 'inactive'] },
            costCentre: { type: 'string' },
            documentPrefix: { type: 'string' },
            document: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                reference: { type: 'string' },
                fileName: { type: 'string', description: 'Attached PDF, JPG, or PNG. Send a new name to replace it.' },
              },
            },
            notes: { type: 'string' },
          },
        },
        Warehouse: {
          type: 'object',
          properties: {
            _id: objectId,
            branchId: { $ref: '#/components/schemas/BranchRef' },
            name: { type: 'string' },
            code: { type: 'string' },
            location: { type: 'string', description: 'Short area shown in the register' },
            address: { type: 'string', description: 'Operating address. Omitted from lists.' },
            managerId: { ...objectId, nullable: true, description: 'Null until Employee exists. The register shows Unassigned.' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            locations: {
              type: 'array',
              description: 'On GET /warehouses/{id}. Other warehouses and shops of the same branch. Warehouses first, then shops.',
              items: { $ref: '#/components/schemas/LocationChild' },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        WarehouseWrite: {
          type: 'object',
          required: ['branchId', 'name', 'code'],
          properties: {
            branchId: objectId,
            name: { type: 'string' },
            code: { type: 'string', description: 'Stored uppercase' },
            location: { type: 'string' },
            address: { type: 'string' },
            managerId: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        WarehouseUpdate: {
          type: 'object',
          properties: {
            branchId: objectId,
            name: { type: 'string' },
            code: { type: 'string' },
            location: { type: 'string' },
            address: { type: 'string' },
            managerId: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        ShopRegisterSummary: {
          type: 'object',
          properties: {
            shops: {
              type: 'object',
              properties: {
                total: { type: 'integer', example: 8 },
                active: { type: 'integer', example: 7 },
              },
            },
            branches: { type: 'integer', description: 'Branches that have at least one shop', example: 3 },
            assignedStaff: { type: 'integer', description: '0 until Employee exists', example: 0 },
          },
        },
        ShopPageMeta: {
          allOf: [
            { $ref: '#/components/schemas/PageMeta' },
            {
              type: 'object',
              properties: {
                summary: { $ref: '#/components/schemas/ShopRegisterSummary' },
              },
            },
          ],
        },
        ShopEmployee: {
          type: 'object',
          properties: {
            _id: objectId,
            code: { type: 'string', example: 'EMP-001' },
            name: { type: 'string' },
            role: { type: 'string', example: 'Shop manager' },
            assignment: { type: 'string', enum: ['primary', 'secondary'] },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        Shop: {
          type: 'object',
          properties: {
            _id: objectId,
            branchId: { $ref: '#/components/schemas/BranchRef' },
            name: { type: 'string' },
            code: { type: 'string' },
            shopType: { type: 'string', enum: ['retail', 'outlet', 'counter', 'wholesale'] },
            shopTypeLabel: { type: 'string', example: 'Retail outlet' },
            location: { type: 'string', description: 'City or district' },
            address: { type: 'string', description: 'Operating address. Omitted from lists.' },
            phone: { type: 'string' },
            email: { type: 'string' },
            priceList: { type: 'string' },
            cashAccount: { type: 'string' },
            openingHours: { type: 'string' },
            document: {
              type: 'object',
              properties: {
                type: { type: 'string', example: 'Shop lease / registration' },
                reference: { type: 'string' },
                fileName: { type: 'string' },
              },
            },
            notes: { type: 'string' },
            managerId: { ...objectId, nullable: true, description: 'Null until Employee exists. The register shows the manager as empty.' },
            warehouseId: {
              nullable: true,
              description: 'Linked warehouse. Must belong to this shop’s branch.',
              type: 'object',
              properties: {
                _id: objectId,
                name: { type: 'string' },
                code: { type: 'string' },
                status: { type: 'string', enum: ['active', 'inactive'] },
              },
            },
            status: { type: 'string', enum: ['active', 'inactive'] },
            warehouses: {
              type: 'array',
              description: 'Warehouses in this shop’s branch. Present on the shop detail.',
              items: {
                type: 'object',
                properties: {
                  _id: objectId,
                  name: { type: 'string' },
                  code: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'inactive'] },
                },
              },
            },
            summary: { $ref: '#/components/schemas/ShopRegisterSummary' },
            employees: {
              type: 'array',
              description: 'Assigned employees for this shop. Empty until Employee exists.',
              items: { $ref: '#/components/schemas/ShopEmployee' },
            },
            employeesMeta: { $ref: '#/components/schemas/PageMeta' },
            locations: {
              type: 'array',
              items: { $ref: '#/components/schemas/LocationChild' },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ShopWrite: {
          type: 'object',
          required: ['branchId', 'name', 'code', 'shopType', 'address'],
          properties: {
            branchId: objectId,
            name: { type: 'string' },
            code: { type: 'string', description: 'Stored uppercase' },
            shopType: { type: 'string', enum: ['retail', 'outlet', 'counter', 'wholesale'] },
            location: { type: 'string', description: 'City or district' },
            address: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
            managerId: { type: 'string', nullable: true, description: 'Null until Employee exists' },
            warehouseId: { ...objectId, nullable: true, description: 'Must be a warehouse of branchId. Select the branch first.' },
            priceList: { type: 'string' },
            cashAccount: { type: 'string' },
            openingHours: { type: 'string' },
            document: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                reference: { type: 'string' },
                fileName: { type: 'string', description: 'PDF, JPG, or PNG' },
              },
            },
            notes: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        ShopUpdate: {
          type: 'object',
          properties: {
            branchId: objectId,
            name: { type: 'string' },
            code: { type: 'string' },
            shopType: { type: 'string', enum: ['retail', 'outlet', 'counter', 'wholesale'] },
            location: { type: 'string' },
            address: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
            managerId: { type: 'string', nullable: true },
            warehouseId: { ...objectId, nullable: true },
            priceList: { type: 'string' },
            cashAccount: { type: 'string' },
            openingHours: { type: 'string' },
            document: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                reference: { type: 'string' },
                fileName: { type: 'string' },
              },
            },
            notes: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        Currency: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            code: { type: 'string', example: 'PKR', minLength: 3, maxLength: 3 },
            symbol: { type: 'string' },
            decimalPlaces: { type: 'integer', minimum: 0, maximum: 6 },
            isBaseCurrency: { type: 'boolean' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CurrencyWrite: {
          type: 'object',
          required: ['name', 'code'],
          properties: {
            name: { type: 'string' },
            code: { type: 'string', minLength: 3, maxLength: 3, description: 'Stored uppercase, for example PKR' },
            symbol: { type: 'string' },
            decimalPlaces: { type: 'integer', minimum: 0, maximum: 6, default: 2 },
            isBaseCurrency: { type: 'boolean', description: 'Setting true clears the previous base currency' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        CurrencyUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            code: { type: 'string', minLength: 3, maxLength: 3 },
            symbol: { type: 'string' },
            decimalPlaces: { type: 'integer', minimum: 0, maximum: 6 },
            isBaseCurrency: { type: 'boolean' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        ProductCategoryNode: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            code: { type: 'string' },
            parentId: { ...objectId, nullable: true },
            status: { type: 'string', enum: ['active'] },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/ProductCategoryNode' },
            },
          },
        },
        ProductCategory: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            code: { type: 'string' },
            parentId: { ...objectId, nullable: true },
            description: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ProductCategoryWrite: {
          type: 'object',
          required: ['name', 'code'],
          properties: {
            name: { type: 'string' },
            code: { type: 'string', description: 'Stored uppercase' },
            parentId: { ...objectId, nullable: true },
            description: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        ProductCategoryUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            code: { type: 'string' },
            parentId: { ...objectId, nullable: true },
            description: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        QuantityUnit: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            shortCode: { type: 'string', example: 'KG' },
            decimalAllowed: { type: 'boolean' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        QuantityUnitWrite: {
          type: 'object',
          required: ['name', 'shortCode'],
          properties: {
            name: { type: 'string' },
            shortCode: { type: 'string', description: 'Stored uppercase' },
            decimalAllowed: { type: 'boolean' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        QuantityUnitUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            shortCode: { type: 'string' },
            decimalAllowed: { type: 'boolean' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        UnitRef: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            shortCode: { type: 'string' },
          },
        },
        PackingUnit: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            shortCode: { type: 'string' },
            conversionQuantity: { type: 'string', example: '12' },
            quantityUnitId: { $ref: '#/components/schemas/UnitRef' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        PackingUnitWrite: {
          type: 'object',
          required: ['name', 'shortCode', 'conversionQuantity', 'quantityUnitId'],
          properties: {
            name: { type: 'string' },
            shortCode: { type: 'string' },
            conversionQuantity: { type: 'string', example: '12', description: 'Positive decimal string' },
            quantityUnitId: objectId,
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        PackingUnitUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            shortCode: { type: 'string' },
            conversionQuantity: { type: 'string' },
            quantityUnitId: objectId,
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        CategoryRef: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            code: { type: 'string' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            _id: objectId,
            categoryId: { $ref: '#/components/schemas/CategoryRef' },
            sku: { type: 'string' },
            name: { type: 'string' },
            barcode: { type: 'string', nullable: true },
            description: { type: 'string', description: 'Omitted from list responses' },
            quantityUnitId: { $ref: '#/components/schemas/UnitRef' },
            packingUnitId: { anyOf: [{ $ref: '#/components/schemas/UnitRef' }, { type: 'null' }] },
            costPrice: { type: 'string', example: '10.50' },
            salePrice: { type: 'string', example: '15.00' },
            reorderLevel: { type: 'string', example: '0' },
            trackBatch: { type: 'boolean' },
            trackExpiry: { type: 'boolean' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ProductWrite: {
          type: 'object',
          required: ['categoryId', 'sku', 'name', 'quantityUnitId', 'costPrice', 'salePrice', 'reorderLevel'],
          properties: {
            categoryId: objectId,
            sku: { type: 'string', description: 'Stored uppercase' },
            name: { type: 'string' },
            barcode: { type: 'string', nullable: true },
            description: { type: 'string' },
            quantityUnitId: objectId,
            packingUnitId: { ...objectId, nullable: true },
            costPrice: { type: 'string', example: '10.50' },
            salePrice: { type: 'string', example: '15.00' },
            reorderLevel: { type: 'string', example: '0' },
            trackBatch: { type: 'boolean' },
            trackExpiry: { type: 'boolean' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        ProductUpdate: {
          type: 'object',
          properties: {
            categoryId: objectId,
            sku: { type: 'string' },
            name: { type: 'string' },
            barcode: { type: 'string', nullable: true },
            description: { type: 'string' },
            quantityUnitId: objectId,
            packingUnitId: { ...objectId, nullable: true },
            costPrice: { type: 'string' },
            salePrice: { type: 'string' },
            reorderLevel: { type: 'string' },
            trackBatch: { type: 'boolean' },
            trackExpiry: { type: 'boolean' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        Permission: {
          type: 'object',
          properties: {
            _id: objectId,
            module: { type: 'string' },
            action: { type: 'string', enum: ['create', 'read', 'update', 'delete', 'approve', 'post', 'all'] },
            code: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }
}
