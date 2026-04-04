const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.1.10:4000'

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token')

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

export async function getDashboardData() {
  let response

  try {
    response = await fetch(`${API_BASE_URL}/api/dashboard`, {
      method: 'GET',
      headers: getAuthHeaders()
    })
  } catch {
    throw new Error('Não foi possível conectar à API.')
  }

  if (!response.ok) {
    let message = 'Erro ao carregar dados do dashboard.'

    try {
      const errorData = await response.json()
      message = errorData?.error || message
    } catch {
      // mantém mensagem padrão
    }

    throw new Error(message)
  }

  const data = await response.json()

  return {
    courses: Array.isArray(data?.courses) ? data.courses : [],
    students: Array.isArray(data?.students) ? data.students : [],
    assignments: Array.isArray(data?.assignments) ? data.assignments : [],
    submissions: Array.isArray(data?.submissions) ? data.submissions : [],
    attendance: Array.isArray(data?.attendance) ? data.attendance : []
  }
}