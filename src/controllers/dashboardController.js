import { buildDashboardPayload } from '../services/dashboardService.js'

export async function getDashboardData(req, res) {
  try {
    const data = await buildDashboardPayload()
    res.json(data)
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Erro ao carregar dashboard'
    })
  }
}