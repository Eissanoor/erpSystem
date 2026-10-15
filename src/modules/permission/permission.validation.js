import { MASTER_STATUS } from '../../common/constants/status.js'
import { listQuery } from '../../common/validation/common.js'

export const permissionListQuery = listQuery(MASTER_STATUS)
