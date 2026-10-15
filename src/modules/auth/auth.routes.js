import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { loginBody, refreshBody } from './auth.validation.js'
import * as authController from './auth.controller.js'

export const authRouter = Router()

authRouter.post('/login', validate({ body: loginBody }), authController.login)
authRouter.post('/refresh', validate({ body: refreshBody }), authController.refresh)
authRouter.post('/logout', authenticate, authController.logout)
authRouter.get('/me', authenticate, authController.me)
