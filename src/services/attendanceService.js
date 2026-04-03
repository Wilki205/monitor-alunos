const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000'

export async function getAttendanceByLesson(courseId, lesson) {
  const query = new URLSearchParams({
    course_id: String(courseId ?? ''),
    lesson: String(lesson ?? '')
  })

  const response = await fetch(`${API_BASE_URL}/api/attendance?${query.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    let message = 'Erro ao carregar chamada.'

    try {
      const errorData = await response.json()
      message = errorData?.error || message
    } catch {
      // mantém mensagem padrão
    }

    throw new Error(message)
  }

  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export async function saveAttendanceRecords(records) {
  const response = await fetch(`${API_BASE_URL}/api/attendance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(records)
  })

  if (!response.ok) {
    let message = 'Erro ao salvar chamada.'

    try {
      const errorData = await response.json()
      message = errorData?.error || message
    } catch {
      // mantém mensagem padrão
    }

    throw new Error(message)
  }

  const data = await response.json()
  return data?.ok === true
}

export async function getAllAttendance() {
  const dashboardResponse = await fetch(`${API_BASE_URL}/api/dashboard`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!dashboardResponse.ok) {
    let message = 'Erro ao carregar presenças.'

    try {
      const errorData = await dashboardResponse.json()
      message = errorData?.error || message
    } catch {
      // mantém mensagem padrão
    }

    throw new Error(message)
  }

  const data = await dashboardResponse.json()
  return Array.isArray(data?.attendance) ? data.attendance : []
}