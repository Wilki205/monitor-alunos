<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import PendencyChart from './components/PendencyChart.vue'
import DonutChart from './components/DonutChart.vue'
import LoginView from './components/LoginView.vue'

import { useDashboardData } from './composables/useDashboardData'
import { useAttendance } from './composables/useAttendance'
import { useStatusMessage } from './composables/useStatusMessage'

import { normalizeId, normalizeText, formatDate } from './utils/helpers'
import { PENDING_STATES } from './utils/assignmentRules'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.1.10:4000'

const activeTab = ref('dashboard')

// Auth
const currentUser = ref(null)
const checkingSession = ref(true)

// Filtros de turma
const courseStatusFilter = ref('all')
const courseSearch = ref('')

// Busca
const studentSearch = ref('')
const assignmentSearch = ref('')

// Modais
const showModal = ref(false)
const selectedStudentData = ref(null)
const studentPendingTasks = ref([])

const showAssignmentModal = ref(false)
const selectedAssignment = ref(null)
const assignmentPendingList = ref([])

const {
  loading,
  selectedCourse,
  courses,
  assignments,
  allAttendance,
  dashboardCourses,
  dashboardAssignments,
  dashboardSubmissions,
  dashboardStudents,
  dashboardAttendance,
  coursesMap,
  assignmentsMap,
  studentsMap,
  kpis,
  performanceStats,
  fetchData
} = useDashboardData()

const {
  statusMessage,
  errorMessage,
  showStatus,
  clearStatus
} = useStatusMessage()

const {
  attendanceLesson,
  attendanceList,
  savingAttendance,
  availableLessons,
  loadAttendanceData,
  saveAttendance
} = useAttendance({
  selectedCourse,
  dashboardAssignments,
  dashboardStudents,
  allAttendance,
  showStatus
})

function getToken() {
  return localStorage.getItem('auth_token')
}

function getAuthHeaders() {
  const token = getToken()

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

function normalizeCourseState(course) {
  const rawState = String(course?.status || course?.courseState || '').toUpperCase()

  if (rawState === 'ARCHIVED') return 'archived'
  if (rawState === 'ACTIVE') return 'active'
  return 'unknown'
}

const visibleCourses = computed(() => {
  const term = normalizeText(courseSearch.value)

  return courses.value.filter(course => {
    const courseState = normalizeCourseState(course)

    const matchStatus =
      courseStatusFilter.value === 'all' ||
      courseState === courseStatusFilter.value

    const matchSearch =
      !term ||
      normalizeText(course.name).includes(term) ||
      normalizeText(course.section || '').includes(term)

    return matchStatus && matchSearch
  })
})

watch(visibleCourses, (list) => {
  if (selectedCourse.value === 'all') return

  const stillExists = list.some(course => normalizeId(course.id) === normalizeId(selectedCourse.value))

  if (!stillExists) {
    selectedCourse.value = 'all'
  }
})

function resetUiState() {
  activeTab.value = 'dashboard'
  selectedCourse.value = 'all'
  courseStatusFilter.value = 'all'
  courseSearch.value = ''
  studentSearch.value = ''
  assignmentSearch.value = ''
  showModal.value = false
  selectedStudentData.value = null
  studentPendingTasks.value = []
  showAssignmentModal.value = false
  selectedAssignment.value = null
  assignmentPendingList.value = []
}

function clearSession() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
  currentUser.value = null
  resetUiState()
  clearStatus()
}

function loadUserFromStorage() {
  const token = localStorage.getItem('auth_token')
  const user = localStorage.getItem('auth_user')

  if (!token || !user) {
    currentUser.value = null
    return
  }

  try {
    currentUser.value = JSON.parse(user)
  } catch {
    clearSession()
  }
}

async function validateSession() {
  const token = getToken()

  if (!token) {
    currentUser.value = null
    return false
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: getAuthHeaders()
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data?.error || 'Sessão inválida.')
    }

    if (!data?.user) {
      throw new Error('Sessão inválida.')
    }

    currentUser.value = data.user
    localStorage.setItem('auth_user', JSON.stringify(data.user))
    return true
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()

    if (
      message.includes('token') ||
      message.includes('sessão inválida') ||
      message.includes('unauthorized') ||
      message.includes('não informado') ||
      message.includes('expirado')
    ) {
      clearSession()
      return false
    }

    showStatus(error?.message || 'Não foi possível validar a sessão.', 'error')
    return false
  }
}

async function loadDashboard() {
  try {
    await fetchData()
  } catch (error) {
    const message = error?.message || 'Erro ao carregar dados.'

    if (
      message.toLowerCase().includes('token inválido') ||
      message.toLowerCase().includes('token não informado') ||
      message.toLowerCase().includes('expirado') ||
      message.toLowerCase().includes('unauthorized')
    ) {
      clearSession()
      return
    }

    showStatus(message, 'error')
  }
}

async function initializeApp() {
  checkingSession.value = true
  clearStatus()
  loadUserFromStorage()

  if (!currentUser.value) {
    checkingSession.value = false
    return
  }

  const validSession = await validateSession()

  if (!validSession) {
    checkingSession.value = false
    return
  }

  await loadDashboard()
  checkingSession.value = false
}

async function handleLoginSuccess(user) {
  currentUser.value = user
  clearStatus()
  await initializeApp()
}

function logout() {
  clearSession()
}

// --- LISTAS FILTRADAS ---
const filteredStudents = computed(() => {
  const term = normalizeText(studentSearch.value)
  if (!term) return dashboardStudents.value

  return dashboardStudents.value.filter(student =>
    normalizeText(student.name).includes(term)
  )
})

const filteredAssignments = computed(() => {
  const term = normalizeText(assignmentSearch.value)

  return dashboardAssignments.value
    .map(a => {
      const course = coursesMap.value.get(normalizeId(a.course_id))
      return {
        ...a,
        courseName: course?.name || 'Turma não encontrada'
      }
    })
    .filter(a => {
      if (!term) return true
      return (
        normalizeText(a.title).includes(term) ||
        normalizeText(a.courseName).includes(term)
      )
    })
    .sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true })
    )
})

function getStats(assignmentId) {
  return dashboardSubmissions.value.filter(
    s =>
      normalizeId(s.assignment_id) === normalizeId(assignmentId) &&
      PENDING_STATES.includes(String(s.state || '').toUpperCase())
  ).length
}

// --- WATCHERS ---
watch([selectedCourse, attendanceLesson, activeTab], () => {
  if (activeTab.value === 'attendance' && currentUser.value) {
    loadAttendanceData()
  }
})

// --- MODAL ALUNO ---
function openStudentDetails(student) {
  selectedStudentData.value = student

  studentPendingTasks.value = dashboardSubmissions.value
    .filter(
      s =>
        normalizeId(s.student_id) === normalizeId(student.id) &&
        PENDING_STATES.includes(String(s.state || '').toUpperCase())
    )
    .map(s => {
      const task = assignmentsMap.value.get(normalizeId(s.assignment_id))
      const course = coursesMap.value.get(normalizeId(task?.course_id))

      return {
        ...s,
        taskTitle: task?.title || 'Atividade sem título',
        courseId: task?.course_id ?? null,
        courseName: course?.name || 'Turma não encontrada'
      }
    })
    .sort((a, b) =>
      String(a.taskTitle || '').localeCompare(String(b.taskTitle || ''), undefined, { numeric: true })
    )

  showModal.value = true
}

function closeStudentModal() {
  showModal.value = false
  selectedStudentData.value = null
  studentPendingTasks.value = []
}

function sendWhatsapp() {
  if (!selectedStudentData.value) return

  const firstName = String(selectedStudentData.value.name || '').split(' ')[0] || 'Aluno'
  const taskList = studentPendingTasks.value
    .slice(0, 5)
    .map(task => `• ${task.taskTitle}`)
    .join('\n')

  const total = studentPendingTasks.value.length
  const extraMsg = total > 5 ? `\n(...e mais ${total - 5})` : ''
  const text = `Olá ${firstName}! Identificamos algumas pendências:\n\n${taskList}${extraMsg}`

  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
}

// --- MODAL ATIVIDADE ---
function openAssignmentDetails(assignment) {
  selectedAssignment.value = assignment

  const pendingSubs = dashboardSubmissions.value.filter(
    s =>
      normalizeId(s.assignment_id) === normalizeId(assignment.id) &&
      PENDING_STATES.includes(String(s.state || '').toUpperCase())
  )

  assignmentPendingList.value = pendingSubs
    .map(sub => {
      const student = studentsMap.value.get(normalizeId(sub.student_id))
      return {
        id: sub.student_id,
        name: student?.name || 'Aluno não encontrado',
        firstName: String(student?.name || 'Aluno').split(' ')[0]
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  showAssignmentModal.value = true
}

function closeAssignmentModal() {
  showAssignmentModal.value = false
  selectedAssignment.value = null
  assignmentPendingList.value = []
}

function cobrarIndividual(studentName, taskTitle) {
  const text = `Olá ${studentName}, a atividade "${taskTitle}" está pendente.`
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
}

// --- CICLO DE VIDA ---
onMounted(async () => {
  await initializeApp()
})
</script>

<template>
  <LoginView
    v-if="!currentUser && !checkingSession"
    @login-success="handleLoginSuccess"
  />

  <div v-else-if="checkingSession" class="page-shell">
    <div class="container">
      <main class="loading-card">
        <div class="loading-icon">🔐</div>
        <p>Validando sessão...</p>
      </main>
    </div>
  </div>

  <div v-else class="page-shell">
    <div class="container">
      <header class="hero-card">
        <div class="hero-main">
          <div class="hero-copy">
            <span class="eyebrow">PAINEL ACADÊMICO</span>
            <h1>Monitor de Entregas</h1>
            <p class="subtitle">
              Acompanhamento de desafios, miniprojetos, pendências e chamada por turma.
            </p>
          </div>

          <div class="hero-side">
            <div class="hero-filter">
              <label class="filter-label">Status das turmas</label>
              <select v-model="courseStatusFilter" class="course-filter">
                <option value="all">Todas</option>
                <option value="active">Ativas</option>
                <option value="archived">Arquivadas</option>
              </select>
            </div>

            <div class="hero-filter">
              <label class="filter-label">Buscar turma</label>
              <input
                v-model="courseSearch"
                type="text"
                class="search-input"
                placeholder="Digite o nome da turma..."
              />
            </div>

            <div class="hero-filter">
              <label class="filter-label">Turma</label>
              <select v-model="selectedCourse" class="course-filter">
                <option value="all">Todas as Turmas</option>
                <option
                  v-for="course in visibleCourses"
                  :key="course.id"
                  :value="course.id"
                >
                  {{ course.name }}
                </option>
              </select>
            </div>

            <div class="user-box">
              <div class="user-meta">
                <img
                  v-if="currentUser?.picture"
                  :src="currentUser.picture"
                  alt="Foto do usuário"
                  class="user-avatar"
                />
                <div class="user-text">
                  <strong>{{ currentUser?.name || 'Usuário' }}</strong>
                  <span>{{ currentUser?.email }}</span>
                </div>
              </div>

              <button class="logout-btn" @click="logout">
                Sair
              </button>
            </div>
          </div>
        </div>

        <div class="tabs-wrap">
          <div class="tabs">
            <button :class="{ active: activeTab === 'dashboard' }" @click="activeTab = 'dashboard'">
              Dashboard
            </button>
            <button :class="{ active: activeTab === 'students' }" @click="activeTab = 'students'">
              Alunos
            </button>
            <button :class="{ active: activeTab === 'assignments' }" @click="activeTab = 'assignments'">
              Atividades
            </button>
            <button :class="{ active: activeTab === 'attendance' }" @click="activeTab = 'attendance'">
              Chamada
            </button>
          </div>
        </div>
      </header>

      <div v-if="statusMessage && !errorMessage" class="status-banner success">
        {{ statusMessage }}
      </div>

      <div v-if="errorMessage" class="status-banner error">
        {{ errorMessage }}
      </div>

      <main v-if="loading" class="loading-card">
        <div class="loading-icon">⏳</div>
        <p>Carregando dados do painel...</p>
      </main>

      <main v-else>
        <section v-if="activeTab === 'dashboard'" class="dashboard-layout">
          <div class="chart-panel surface">
            <div class="panel-head">
              <div>
                <h3>Pendências x Entregas</h3>
                <p>
                  {{ selectedCourse === 'all'
                    ? 'Visão consolidada de todas as turmas'
                    : 'Visão da turma selecionada' }}
                </p>
              </div>
            </div>

            <PendencyChart
              :key="selectedCourse"
              :courses="dashboardCourses"
              :assignments="dashboardAssignments"
              :submissions="dashboardSubmissions"
              :attendance="dashboardAttendance"
            />
          </div>

          <aside class="kpi-column">
            <div class="metric-card surface">
              <div class="metric-top">
                <span class="metric-label">Desafios / Projetos</span>
                <span class="metric-icon icon-purple">📚</span>
              </div>
              <div class="metric-value">{{ kpis.totalClasses }}</div>
              <p class="metric-note">Atividades práticas mapeadas</p>
            </div>

            <div class="metric-card surface">
              <div class="metric-top">
                <span class="metric-label">Entregas Feitas</span>
                <span class="metric-icon icon-green">✅</span>
              </div>
              <div class="metric-value green">{{ kpis.totalDelivered }}</div>
              <p class="metric-note">Submissões concluídas</p>
            </div>

            <div class="metric-card surface">
              <div class="metric-top">
                <span class="metric-label">Miniprojetos Feitos</span>
                <span class="metric-icon icon-blue">💻</span>
              </div>
              <div class="metric-value blue">{{ kpis.totalMiniDelivered }}</div>
              <p class="metric-note">Projetos entregues com sucesso</p>
            </div>
          </aside>

          <div class="donut-grid">
            <div class="donut-card surface">
              <div class="donut-head">
                <h4>Desempenho Geral</h4>
                <span>Meta acima de 60%</span>
              </div>
              <DonutChart
                :key="'general-' + selectedCourse"
                :percent="performanceStats.general"
                color="#22c55e"
                label="Indicador geral"
              />
            </div>

            <div class="donut-card surface">
              <div class="donut-head">
                <h4>Miniprojetos</h4>
                <span>Meta acima de 60%</span>
              </div>
              <DonutChart
                :key="'mini-' + selectedCourse"
                :percent="performanceStats.mini"
                color="#0ea5e9"
                label="Indicador de projetos"
              />
            </div>

            <div class="donut-card surface">
              <div class="donut-head">
                <h4>Alunos em Risco</h4>
                <span>Abaixo de 75%</span>
              </div>
              <DonutChart
                :key="'risk-' + selectedCourse"
                :percent="performanceStats.risk"
                color="#ef4444"
                label="Indicador de risco"
              />
            </div>
          </div>
        </section>

        <section v-if="activeTab === 'students'" class="content-section">
          <div class="toolbar surface toolbar-slim">
            <input
              v-model="studentSearch"
              type="text"
              class="search-input"
              placeholder="Buscar aluno..."
            />
          </div>

          <ul class="student-list">
            <li
              v-for="student in filteredStudents"
              :key="student.id"
              class="surface list-row"
              @click="openStudentDetails(student)"
            >
              <div class="student-info">
                <span class="avatar">👤</span>
                <span class="name">{{ student.name }}</span>
              </div>
              <span class="arrow">Ver pendências</span>
            </li>

            <li v-if="filteredStudents.length === 0" class="empty-panel">
              Nenhum aluno encontrado.
            </li>
          </ul>
        </section>

        <section v-if="activeTab === 'assignments'" class="content-section">
          <div class="toolbar surface toolbar-slim">
            <input
              v-model="assignmentSearch"
              type="text"
              class="search-input"
              placeholder="Buscar atividade ou turma..."
            />
          </div>

          <div class="assignments-grid">
            <div
              v-for="work in filteredAssignments"
              :key="work.id"
              class="surface assignment-card"
              @click="openAssignmentDetails(work)"
            >
              <div class="card-header">
                <span class="course-badge">{{ work.courseName }}</span>
                <span class="date">{{ formatDate(work.due_date) }}</span>
              </div>

              <h3>{{ work.title }}</h3>

              <div class="stats-row">
                <div class="stat-box">
                  <span class="big-number">{{ getStats(work.id) }}</span>
                  <span class="label">Pendentes</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="filteredAssignments.length === 0" class="empty-panel">
            Nenhuma atividade encontrada.
          </div>
        </section>

        <section v-if="activeTab === 'attendance'" class="content-section">
          <div v-if="selectedCourse === 'all'" class="empty-state-attendance">
            Selecione uma turma específica no topo para fazer a chamada.
          </div>

          <div v-else class="surface attendance-panel">
            <div class="attendance-header">
              <div>
                <h3>Diário de Classe</h3>
                <small v-if="availableLessons.some(l => !l.done)" class="attendance-warning">
                  Faltam lançar {{ availableLessons.filter(l => !l.done).length }} aulas.
                </small>
                <small v-else class="attendance-ok">
                  Todas as aulas foram lançadas.
                </small>
              </div>

              <div class="attendance-controls">
                <select v-model="attendanceLesson" class="lesson-picker">
                  <option disabled value="">Selecione a Aula...</option>
                  <option
                    v-for="lesson in availableLessons"
                    :key="lesson.name"
                    :value="lesson.name"
                  >
                    {{ lesson.done ? '✅' : '⚠️' }} {{ lesson.name }}
                  </option>
                </select>

                <button
                  class="save-btn"
                  @click="saveAttendance"
                  :disabled="savingAttendance"
                >
                  {{ savingAttendance ? 'Salvando...' : 'Salvar chamada' }}
                </button>
              </div>
            </div>

            <ul class="student-list">
              <li
                v-for="item in attendanceList"
                :key="item.student_id"
                class="surface list-row attendance-item"
              >
                <div class="student-info">
                  <span class="avatar">👤</span>
                  <span class="name">{{ item.name }}</span>
                </div>

                <div class="attendance-actions">
                  <button
                    class="p-btn"
                    :class="{ active: item.present }"
                    @click="item.present = true"
                  >
                    P
                  </button>
                  <button
                    class="f-btn"
                    :class="{ active: !item.present }"
                    @click="item.present = false"
                  >
                    F
                  </button>
                </div>
              </li>

              <li v-if="attendanceList.length === 0" class="empty-panel">
                Nenhum aluno disponível para essa aula.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <!-- MODAL ALUNO -->
      <div v-if="showModal" class="modal-overlay" @click.self="closeStudentModal">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h3>{{ selectedStudentData?.name }}</h3>
              <p class="modal-subtitle">Pendências encontradas no período filtrado</p>
            </div>

            <div class="modal-actions">
              <button class="whatsapp-btn" @click="sendWhatsapp">Cobrar</button>
              <button class="close-btn" @click="closeStudentModal">✕</button>
            </div>
          </div>

          <div class="modal-body">
            <p v-if="studentPendingTasks.length === 0" class="empty-msg">
              Nenhuma pendência encontrada.
            </p>

            <ul v-else class="task-list">
              <li
                v-for="item in studentPendingTasks"
                :key="`${item.student_id}-${item.assignment_id}`"
              >
                <div class="task-row">
                  <strong>{{ item.taskTitle }}</strong>
                  <small>{{ item.courseName }}</small>
                </div>
                <span class="status-badge">Pendente</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- MODAL ATIVIDADE -->
      <div
        v-if="showAssignmentModal"
        class="modal-overlay"
        @click.self="closeAssignmentModal"
      >
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h3>{{ selectedAssignment?.title }}</h3>
              <p class="modal-subtitle">Alunos com pendência nessa atividade</p>
            </div>

            <button class="close-btn" @click="closeAssignmentModal">✕</button>
          </div>

          <div class="modal-body">
            <p v-if="assignmentPendingList.length === 0" class="empty-msg">
              Nenhum aluno com pendência.
            </p>

            <ul v-else class="student-list-modal">
              <li v-for="student in assignmentPendingList" :key="student.id">
                <span class="student-name-modal">{{ student.name }}</span>
                <button
                  class="mini-whatsapp-btn"
                  @click.stop="cobrarIndividual(student.firstName, selectedAssignment?.title || 'atividade')"
                >
                  📱
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:global(body) {
  margin: 0;
  font-family: Inter, 'Segoe UI', sans-serif;
  background:
    radial-gradient(circle at top left, rgba(249, 115, 22, 0.10), transparent 28%),
    radial-gradient(circle at top right, rgba(34, 197, 94, 0.10), transparent 22%),
    linear-gradient(180deg, #fbf8ef 0%, #f7f3e8 100%);
  color: #1e293b;
}

.page-shell {
  min-height: 100vh;
  padding: 28px 20px 40px;
}

.container {
  max-width: 1240px;
  margin: 0 auto;
}

.surface {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e7dcc4;
  box-shadow: 0 20px 45px rgba(71, 85, 105, 0.08);
  backdrop-filter: blur(12px);
}

.hero-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.97), rgba(255,250,240,0.94));
  border: 1px solid #e7dcc4;
  box-shadow: 0 18px 50px rgba(71, 85, 105, 0.08);
  border-radius: 28px;
  padding: 28px;
  margin-bottom: 22px;
}

.hero-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 22px;
  flex-wrap: wrap;
}

.hero-copy {
  max-width: 720px;
}

.hero-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 280px;
}

.eyebrow {
  display: inline-block;
  margin-bottom: 10px;
  color: #ea580c;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 2.8rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: #1e3a8a;
}

.subtitle {
  margin: 12px 0 0;
  font-size: 1rem;
  color: #64748b;
  max-width: 700px;
}

.hero-filter {
  min-width: 250px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: rgba(255, 250, 240, 0.88);
  border: 1px solid #eadfca;
  border-radius: 20px;
}

.user-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid #eadfca;
  border-radius: 18px;
}

.user-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.user-avatar {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  object-fit: cover;
  border: 2px solid #fed7aa;
}

.user-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-text strong {
  color: #1e3a8a;
  font-size: 0.95rem;
}

.user-text span {
  color: #64748b;
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.logout-btn {
  border: none;
  background: #fff7ed;
  color: #ea580c;
  border: 1px solid #fed7aa;
  padding: 10px 14px;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: 0.2s ease;
}

.logout-btn:hover {
  background: #ffedd5;
}

.filter-label {
  font-size: 0.85rem;
  color: #475569;
  font-weight: 700;
}

.course-filter,
.lesson-picker,
.search-input {
  width: 100%;
  background: #ffffff;
  color: #1e293b;
  border: 1px solid #d8ccb4;
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 0.95rem;
  outline: none;
  transition: 0.2s ease;
}

.course-filter:focus,
.lesson-picker:focus,
.search-input:focus {
  border-color: #f97316;
  box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.12);
}

.tabs-wrap {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(231, 220, 196, 0.95);
}

.tabs {
  display: inline-flex;
  gap: 10px;
  padding: 6px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 18px;
  flex-wrap: wrap;
}

.tabs button {
  border: none;
  background: transparent;
  color: #475569;
  font-size: 0.95rem;
  font-weight: 700;
  padding: 11px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: 0.2s ease;
}

.tabs button:hover {
  background: rgba(255, 255, 255, 0.82);
}

.tabs button.active {
  background: linear-gradient(135deg, #f97316, #ea580c);
  color: #ffffff;
  box-shadow: 0 10px 22px rgba(249, 115, 22, 0.24);
}

.status-banner {
  margin-bottom: 18px;
  padding: 14px 18px;
  border-radius: 16px;
  font-weight: 700;
}

.status-banner.success {
  background: #ecfdf3;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.status-banner.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
}

.loading-card {
  min-height: 220px;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #64748b;
  background: rgba(255,255,255,0.92);
  border: 1px solid #e7dcc4;
  box-shadow: 0 20px 45px rgba(71, 85, 105, 0.08);
}

.loading-icon {
  font-size: 2rem;
}

.dashboard-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 300px;
  gap: 22px;
  align-items: start;
}

.chart-panel,
.metric-card,
.donut-card,
.toolbar,
.assignment-card,
.attendance-panel,
.list-row {
  border-radius: 24px;
}

.chart-panel {
  padding: 24px;
  min-width: 0;
}

.panel-head h3 {
  margin: 0;
  font-size: 1.18rem;
  color: #1e3a8a;
}

.panel-head p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 0.95rem;
}

.kpi-column {
  display: grid;
  gap: 18px;
}

.metric-card {
  padding: 20px;
}

.metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.metric-label {
  font-size: 0.78rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  font-weight: 800;
}

.metric-icon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 1.1rem;
}

.icon-purple {
  background: #ffedd5;
}

.icon-green {
  background: #dcfce7;
}

.icon-blue {
  background: #dbeafe;
}

.metric-value {
  margin-top: 16px;
  font-size: 2.4rem;
  font-weight: 800;
  line-height: 1;
  color: #1e3a8a;
}

.metric-value.green {
  color: #16a34a;
}

.metric-value.blue {
  color: #ea580c;
}

.metric-note {
  margin: 10px 0 0;
  color: #94a3b8;
  font-size: 0.9rem;
}

.donut-grid {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.donut-card {
  padding: 22px;
  text-align: center;
}

.donut-head {
  margin-bottom: 14px;
}

.donut-head h4 {
  margin: 0;
  font-size: 1rem;
  color: #1e3a8a;
}

.donut-head span {
  display: inline-block;
  margin-top: 6px;
  color: #64748b;
  font-size: 0.88rem;
}

.content-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.toolbar {
  padding: 14px;
}

.toolbar-slim {
  border-radius: 20px;
}

.student-list,
.task-list,
.student-list-modal {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list-row {
  padding: 18px;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: 0.2s ease;
}

.list-row:hover,
.assignment-card:hover {
  transform: translateY(-2px);
  border-color: #fdba74;
  box-shadow: 0 22px 45px rgba(249, 115, 22, 0.08);
}

.student-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
  color: #15803d;
  font-size: 1rem;
}

.name {
  font-weight: 700;
}

.arrow {
  color: #ea580c;
  font-weight: 700;
  font-size: 0.92rem;
}

.assignments-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 18px;
}

.assignment-card {
  padding: 20px;
  cursor: pointer;
  transition: 0.2s ease;
}

.card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.course-badge {
  background: #ecfdf5;
  color: #166534;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
}

.date {
  color: #64748b;
  font-size: 0.82rem;
}

.assignment-card h3 {
  margin: 0 0 18px;
  font-size: 1rem;
  line-height: 1.4;
  color: #1e293b;
}

.stats-row {
  margin-top: auto;
}

.stat-box {
  background: linear-gradient(180deg, #fff5f5, #fef2f2);
  color: #b91c1c;
  padding: 14px;
  border-radius: 16px;
  text-align: center;
  border: 1px solid #fecaca;
}

.big-number {
  display: block;
  font-size: 1.7rem;
  font-weight: 800;
}

.stat-box .label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 800;
}

.empty-panel,
.empty-msg {
  background: rgba(255,255,255,0.92);
  border: 1px dashed #d8ccb4;
  border-radius: 20px;
  padding: 22px;
  text-align: center;
  color: #64748b;
}

.empty-state-attendance {
  text-align: center;
  padding: 32px;
  color: #92400e;
  font-size: 1rem;
  background: #fffbeb;
  border-radius: 22px;
  border: 1px dashed #f59e0b;
}

.attendance-panel {
  padding: 22px;
}

.attendance-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.attendance-header h3 {
  margin: 0;
  color: #1e3a8a;
}

.attendance-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.attendance-warning {
  color: #ea580c;
  font-weight: 700;
}

.attendance-ok {
  color: #16a34a;
  font-weight: 700;
}

.save-btn {
  background: linear-gradient(135deg, #f97316, #ea580c);
  color: #ffffff;
  border: none;
  padding: 12px 16px;
  border-radius: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(249, 115, 22, 0.20);
}

.save-btn:hover {
  transform: translateY(-1px);
}

.save-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
}

.attendance-item {
  cursor: default !important;
}

.attendance-actions {
  display: flex;
  gap: 8px;
}

.p-btn,
.f-btn {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  border: 2px solid #d8ccb4;
  background: #ffffff;
  color: #64748b;
  font-weight: 800;
  cursor: pointer;
  transition: 0.2s ease;
}

.p-btn.active {
  background: #22c55e;
  border-color: #22c55e;
  color: #ffffff;
}

.f-btn.active {
  background: #ef4444;
  border-color: #ef4444;
  color: #ffffff;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(30, 41, 59, 0.42);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
  backdrop-filter: blur(8px);
  padding: 18px;
}

.modal-content {
  width: 100%;
  max-width: 580px;
  border-radius: 24px;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #e7dcc4;
  box-shadow: 0 24px 60px rgba(71, 85, 105, 0.14);
}

.modal-header {
  background: linear-gradient(180deg, #ffffff, #fffaf0);
  padding: 20px 22px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #eadfca;
}

.modal-header h3 {
  margin: 0;
  color: #1e3a8a;
}

.modal-subtitle {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.modal-body {
  padding: 20px 22px;
  max-height: 60vh;
  overflow-y: auto;
}

.modal-actions {
  display: flex;
  gap: 10px;
}

.whatsapp-btn {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #ffffff;
  border: none;
  padding: 10px 14px;
  border-radius: 999px;
  font-weight: 800;
  cursor: pointer;
}

.mini-whatsapp-btn {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #ffffff;
  border: none;
  border-radius: 999px;
  width: 36px;
  height: 36px;
  cursor: pointer;
}

.close-btn {
  background: #fffaf0;
  border: 1px solid #eadfca;
  color: #64748b;
  cursor: pointer;
  font-size: 1rem;
  width: 38px;
  height: 38px;
  border-radius: 12px;
}

.task-list li,
.student-list-modal li {
  padding: 14px 0;
  border-bottom: 1px solid #eadfca;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.task-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-row small {
  color: #64748b;
}

.status-badge {
  background: #fef2f2;
  color: #dc2626;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 800;
  white-space: nowrap;
}

.student-name-modal {
  font-weight: 700;
}

@media (max-width: 1024px) {
  .dashboard-layout {
    grid-template-columns: 1fr;
  }

  .donut-grid {
    grid-template-columns: 1fr;
  }

  .hero-side {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .page-shell {
    padding: 16px 12px 28px;
  }

  .hero-card {
    padding: 20px;
    border-radius: 22px;
  }

  .tabs {
    width: 100%;
  }

  .tabs button {
    flex: 1 1 auto;
    text-align: center;
  }

  .metric-value {
    font-size: 2rem;
  }

  .user-box {
    flex-direction: column;
    align-items: stretch;
  }

  .user-text span {
    max-width: 100%;
  }
}
</style>