import { getAttendance, upsertAttendance } from '../services/attendanceService.js'

export async function getAttendanceByLesson(req, res) {
  try {
    const { course_id, lesson } = req.query
    const data = await getAttendance(course_id, lesson)
    res.json(data)
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Erro ao carregar chamada'
    })
  }
}

export async function saveAttendance(req, res) {
  try {
    const records = req.body
    await upsertAttendance(records)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Erro ao salvar chamada'
    })
  }
}