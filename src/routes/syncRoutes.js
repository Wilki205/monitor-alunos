import { Router } from 'express'
import { runSync } from '../controllers/syncController.js'

const router = Router()

router.post('/classroom', runSync)

export default router