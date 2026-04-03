import { syncGoogleClassroom } from '../services/classroomSyncService.js'

export async function runSync(req, res) {
  try {
    const result = await syncGoogleClassroom()
    res.json({ ok: true, result })
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Erro na sincronização'
    })
  }
}