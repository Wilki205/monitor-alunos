<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { createClient } from '@supabase/supabase-js'
import PendencyChart from './components/PendencyChart.vue' 
import DonutChart from './components/DonutChart.vue'

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY)

// --- CONSTANTES ---
const PENDING_STATES = ['CREATED', 'NEW', 'RECLAIMED_BY_STUDENT', 'MISSING']
const DELIVERED_STATES = ['TURNED_IN', 'RETURNED']

// --- ESTADOS ---
const loading = ref(true)
const activeTab = ref('dashboard')
const selectedCourse = ref('all')

// Estados da Chamada
const attendanceLesson = ref('')
const attendanceList = ref([])
const savingAttendance = ref(false)

// --- DADOS BRUTOS ---
const courses = ref([])
const students = ref([])
const assignments = ref([])
const submissions = ref([])
const allAttendance = ref([])

// --- CARREGAMENTO INICIAL ---
async function fetchData() {
  loading.value = true
  
  const [resCourses, resStudents, resAssignments, resSubmissions, resAttendance] = await Promise.all([
    supabase.from('courses').select('*').order('name'),
    supabase.from('students').select('*').order('name'),
    
    // Mantendo o limite alto para garantir que pegamos tudo (o filtro será feito no front)
    supabase.from('assignments').select('*').order('due_date', { ascending: false }).range(0, 50000),
    supabase.from('submissions').select('*, assignments(course_id)').range(0, 50000),
    supabase.from('attendance').select('*').range(0, 50000)
  ])

  if (resCourses.data) courses.value = resCourses.data
  if (resStudents.data) students.value = resStudents.data
  if (resAssignments.data) assignments.value = resAssignments.data
  if (resSubmissions.data) submissions.value = resSubmissions.data
  if (resAttendance.data) allAttendance.value = resAttendance.data
  
  loading.value = false
}

// --- DADOS FILTRADOS (COM CORREÇÃO PARA DESAFIOS/PROJETOS) ---
const dashboardCourses = computed(() => {
  if (selectedCourse.value === 'all') return courses.value
  return courses.value.filter(c => c.id === selectedCourse.value)
})

// 👇 AQUI ESTÁ A CORREÇÃO PRINCIPAL 👇
// 👇 Substitua a computed 'dashboardAssignments' por esta versão atualizada 👇
const dashboardAssignments = computed(() => {
  // 1. Filtra por Curso
  let result = assignments.value
  if (selectedCourse.value !== 'all') {
    result = result.filter(a => a.course_id === selectedCourse.value)
  }

  // 2. Filtra por Palavras-Chave (WHITELIST)
  const keywords = ['desafio', 'miniprojeto', 'mini-projeto', 'mini projeto']
  
  // 3. Filtra por Palavras Proibidas (BLACKLIST)
  // Adicione aqui qualquer palavra que, se aparecer, deve cancelar a atividade
  const blacklist = ['feedback', 'apresentação', 'dúvidas']

  return result.filter(a => {
    const titleLower = (a.title || '').toLowerCase()
    
    // Tem que ter uma palavra boa...
    const hasKeyword = keywords.some(key => titleLower.includes(key))
    
    // ...E NÃO pode ter nenhuma palavra proibida
    const hasForbidden = blacklist.some(bad => titleLower.includes(bad))

    return hasKeyword && !hasForbidden
  })
})
// 👆 FIM DA CORREÇÃO 👆

const dashboardSubmissions = computed(() => {
  // Só considera submissões de atividades que passaram no filtro acima
  const validAssignmentIds = dashboardAssignments.value.map(a => a.id)
  return submissions.value.filter(s => validAssignmentIds.includes(s.assignment_id))
})

const dashboardStudents = computed(() => {
  if (selectedCourse.value === 'all') return students.value
  // Mostra apenas alunos que têm alguma relação com as atividades filtradas
  const activeStudentIds = new Set(dashboardSubmissions.value.map(s => s.student_id))
  return students.value.filter(s => activeStudentIds.has(s.id))
})

const dashboardAttendance = computed(() => {
  if (selectedCourse.value === 'all') return allAttendance.value
  return allAttendance.value.filter(a => a.course_id === selectedCourse.value)
})

// --- NOVA LÓGICA: EXTRAIR AULAS COM STATUS (FEITO/PENDENTE) ---
const availableLessons = computed(() => {
  if (selectedCourse.value === 'all') return []
  
  const lessonsSet = new Set()
  // Só vai procurar "Aula XX" dentro dos Desafios/Projetos filtrados
  dashboardAssignments.value.forEach(a => {
    const match = a.title.match(/(Aula\s+\d+)/i)
    if (match) lessonsSet.add(match[1])
  })
  
  const recordedLessons = new Set(
    allAttendance.value
      .filter(att => att.course_id === selectedCourse.value)
      .map(att => att.lesson)
  )

  return Array.from(lessonsSet)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(lessonName => ({
      name: lessonName,
      done: recordedLessons.has(lessonName)
    }))
})

// Seleciona a primeira aula pendente automaticamente
watch(availableLessons, (newVal) => {
  if (newVal.length > 0 && !attendanceLesson.value) {
    const firstMissing = newVal.find(l => !l.done)
    attendanceLesson.value = firstMissing ? firstMissing.name : newVal[0].name
  }
})

// --- KPIS ---
const kpis = computed(() => {
  const uniqueLessons = new Set()
  dashboardAssignments.value.forEach(a => {
    const match = a.title.match(/Aula\s+(\d+)/i)
    if (match) uniqueLessons.add(`${a.course_id}-Aula${match[1]}`)
    else uniqueLessons.add(a.id)
  })
  const totalClasses = uniqueLessons.size // Agora reflete aulas práticas
  const totalDelivered = dashboardSubmissions.value.filter(s => DELIVERED_STATES.includes(s.state)).length
  const miniProjIds = dashboardAssignments.value.filter(a => a.title.toLowerCase().includes('miniprojeto')).map(a => a.id)
  const totalMiniDelivered = dashboardSubmissions.value.filter(s => miniProjIds.includes(s.assignment_id) && DELIVERED_STATES.includes(s.state)).length
  return { totalClasses, totalDelivered, totalMiniDelivered }
})

// --- DONUTS ---
const performanceStats = computed(() => {
  const targetStudents = dashboardStudents.value
  if (targetStudents.length === 0) return { general: 0, mini: 0, risk: 0 }
  let goodGeneral = 0, goodMini = 0, risk = 0
  const assignmentsMap = new Map()
  
  // Mapeia apenas as atividades filtradas
  dashboardAssignments.value.forEach(a => assignmentsMap.set(a.id, a))

  targetStudents.forEach(student => {
    const studentSubs = dashboardSubmissions.value.filter(s => String(s.student_id) === String(student.id))
    
    let totalAssignmentsStudent = studentSubs.length
    
    // Filtro extra de segurança para miniprojetos
    const miniSubs = studentSubs.filter(s => {
      const task = assignmentsMap.get(s.assignment_id)
      return task && task.title.toLowerCase().includes('miniprojeto')
    })
    
    let totalMiniStudent = miniSubs.length
    
    // Evita divisão por zero
    totalAssignmentsStudent = totalAssignmentsStudent || 1
    totalMiniStudent = totalMiniStudent || 1
    
    const deliveredGeneral = studentSubs.filter(s => DELIVERED_STATES.includes(s.state)).length
    const deliveredMini = miniSubs.filter(s => DELIVERED_STATES.includes(s.state)).length
    
    const pctGeneral = (deliveredGeneral / totalAssignmentsStudent) * 100
    const pctMini = (deliveredMini / totalMiniStudent) * 100
    
    if (pctGeneral >= 60) goodGeneral++
    if (pctMini >= 60) goodMini++
    if (pctGeneral < 75) risk++
  })
  const total = targetStudents.length
  return { general: Math.round((goodGeneral / total) * 100), mini: Math.round((goodMini / total) * 100), risk: Math.round((risk / total) * 100) }
})

// --- LISTAS E MODALS ---
const filteredAssignments = computed(() => {
  return dashboardAssignments.value.map(a => {
    const course = courses.value.find(c => c.id === a.course_id)
    return { ...a, courseName: course?.name }
  }).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
})
const filteredStudents = dashboardStudents

function getStats(assignmentId) {
  return dashboardSubmissions.value.filter(s => s.assignment_id === assignmentId && PENDING_STATES.includes(s.state)).length
}
const formatDate = (date) => date ? new Date(date).toLocaleDateString('pt-BR') : '-'

// --- CHAMADA ---
async function loadAttendanceData() {
  if (selectedCourse.value === 'all') return
  const { data: existingData } = await supabase.from('attendance').select('*').eq('course_id', selectedCourse.value).eq('lesson', attendanceLesson.value)
  attendanceList.value = dashboardStudents.value.map(student => {
    const record = existingData?.find(r => r.student_id === student.id)
    return { student_id: student.id, name: student.name, present: record ? record.present : true }
  })
}
async function saveAttendance() {
  if (selectedCourse.value === 'all') return alert('Selecione uma turma!')
  if (!attendanceLesson.value) return alert('Selecione uma aula!')
  savingAttendance.value = true
  const records = attendanceList.value.map(item => ({ student_id: item.student_id, course_id: selectedCourse.value, lesson: attendanceLesson.value, present: item.present }))
  const { error } = await supabase.from('attendance').upsert(records, { onConflict: 'student_id, course_id, lesson' })
  if (!error) {
    const { data } = await supabase.from('attendance').select('*')
    if (data) allAttendance.value = data
    alert('Chamada salva! ✅')
  } else { alert('Erro ao salvar') }
  savingAttendance.value = false
}
watch([selectedCourse, attendanceLesson, activeTab], () => { if (activeTab.value === 'attendance') loadAttendanceData() })

// --- MODALS ---
const showModal = ref(false); const selectedStudentData = ref(null); const studentPendingTasks = ref([]);
function openStudentDetails(student) {
  selectedStudentData.value = student
  // Busca pendências apenas nas submissões filtradas (já ignora aulas teóricas)
  studentPendingTasks.value = dashboardSubmissions.value.filter(s => s.student_id === student.id && PENDING_STATES.includes(s.state)).map(s => { const task = assignments.value.find(a => a.id === s.assignment_id); return { ...s, taskTitle: task?.title, courseId: task?.course_id } }).sort((a, b) => a.taskTitle.localeCompare(b.taskTitle, undefined, { numeric: true }))
  showModal.value = true
}
function sendWhatsapp() { if (!selectedStudentData.value) return; const firstName = selectedStudentData.value.name.split(' ')[0]; const taskList = studentPendingTasks.value.slice(0, 5).map(t => `• ${t.taskTitle}`).join('\n'); const total = studentPendingTasks.value.length; const extraMsg = total > 5 ? `\n(...e mais ${total - 5})` : ''; const text = `Olá ${firstName}! Pendências:\n\n${taskList}${extraMsg}`; window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') }
const showAssignmentModal = ref(false); const selectedAssignment = ref(null); const assignmentPendingList = ref([]);
function openAssignmentDetails(assignment) { selectedAssignment.value = assignment; const pendingSubs = dashboardSubmissions.value.filter(s => s.assignment_id === assignment.id && PENDING_STATES.includes(s.state)); assignmentPendingList.value = pendingSubs.map(sub => { const student = students.value.find(s => s.id === sub.student_id); return { id: sub.student_id, name: student?.name, firstName: student?.name.split(' ')[0] } }).sort((a, b) => a.name.localeCompare(b.name)); showAssignmentModal.value = true }
function cobrarIndividual(studentName, taskTitle) { window.open(`https://wa.me/?text=${encodeURIComponent(`Olá ${studentName}, a atividade "${taskTitle}" está pendente.`)}`, '_blank') }

onMounted(fetchData)
</script>

<template>
  <div class="container">
    <header>
      <div class="header-top">
        <h1>🚀 Monitor de Entregas (Filtro Ativo)</h1>
        <div class="filter-container">
          <select v-model="selectedCourse" class="course-filter">
            <option value="all">Todas as Turmas</option>
            <option v-for="course in courses" :key="course.id" :value="course.id">{{ course.name }}</option>
          </select>
        </div>
      </div>
      <div class="tabs">
        <button :class="{ active: activeTab === 'dashboard' }" @click="activeTab = 'dashboard'">📊 Dashboard</button>
        <button :class="{ active: activeTab === 'students' }" @click="activeTab = 'students'">👥 Alunos</button>
        <button :class="{ active: activeTab === 'assignments' }" @click="activeTab = 'assignments'">📝 Atividades</button>
        <button :class="{ active: activeTab === 'attendance' }" @click="activeTab = 'attendance'">📢 Chamada</button>
      </div>
    </header>

    <main v-if="loading" class="loading">Carregando dados...</main>

    <main v-else>
      <div v-if="activeTab === 'dashboard'" class="dashboard-grid">
        <div class="main-chart-section card">
          <h3>Pendências vs Entregas ({{ selectedCourse === 'all' ? 'Geral' : 'Filtrado' }})</h3>
          <PendencyChart :key="selectedCourse" :courses="dashboardCourses" :assignments="dashboardAssignments" :submissions="dashboardSubmissions" :attendance="dashboardAttendance" />
        </div>
        <div class="kpi-section">
          <div class="kpi-card"><span class="label">Desafios/Projetos</span><span class="value">{{ kpis.totalClasses }}</span><div class="mini-graph">📚</div></div>
          <div class="kpi-card"><span class="label">Entregas Feitas</span><span class="value green">{{ kpis.totalDelivered }}</span><div class="mini-graph">✅</div></div>
          <div class="kpi-card"><span class="label">Miniprojetos Feitos</span><span class="value blue">{{ kpis.totalMiniDelivered }}</span><div class="mini-graph">💻</div></div>
        </div>
        <div class="donuts-section card">
          <DonutChart :key="'gen-'+selectedCourse" :percent="performanceStats.general" color="#4ade80" label="Desempenho Geral (>60%)" />
          <DonutChart :key="'mini-'+selectedCourse" :percent="performanceStats.mini" color="#38bdf8" label="Miniprojetos (>60%)" />
          <DonutChart :key="'risk-'+selectedCourse" :percent="performanceStats.risk" color="#ef4444" label="Alunos em Risco (<75%)" />
        </div>
      </div>

      <div v-if="activeTab === 'students'" class="grid"><ul class="student-list"><li v-for="student in filteredStudents" :key="student.id" @click="openStudentDetails(student)"><div class="student-info"><span class="avatar">👤</span> <span class="name">{{ student.name }}</span></div><span class="arrow">Ver pendências ➔</span></li></ul></div>
      <div v-if="activeTab === 'assignments'" class="assignments-grid"><div v-for="work in filteredAssignments" :key="work.id" class="card assignment-card" @click="openAssignmentDetails(work)"><div class="card-header"><span class="course-badge">{{ work.courseName }}</span><span class="date">{{ formatDate(work.due_date) }}</span></div><h3>{{ work.title }}</h3><div class="stats-row"><div class="stat-box warning"><span class="big-number">{{ getStats(work.id) }}</span> <span class="label">Pendentes</span></div></div></div></div>
      
      <div v-if="activeTab === 'attendance'" class="attendance-container">
        <div v-if="selectedCourse === 'all'" class="empty-state-attendance">⚠️ Selecione uma turma específica no topo para fazer a chamada!</div>
        <div v-else class="card full-width">
          <div class="attendance-header">
            <div>
              <h3>Diário de Classe</h3>
              <small v-if="availableLessons.some(l => !l.done)" style="color: #ef4444; font-weight: bold;">
                ⚠️ Faltam lançar {{ availableLessons.filter(l => !l.done).length }} aulas!
              </small>
              <small v-else style="color: #4ade80; font-weight: bold;">
                ✅ Todas as aulas lançadas!
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
              
              <button class="save-btn" @click="saveAttendance" :disabled="savingAttendance">
                {{ savingAttendance ? 'Salvando...' : '💾 Salvar' }}
              </button>
            </div>
          </div>
          <ul class="student-list">
            <li v-for="item in attendanceList" :key="item.student_id" class="attendance-item"><div class="student-info"><span class="avatar">👤</span> <span class="name">{{ item.name }}</span></div><div class="attendance-actions"><button class="p-btn" :class="{ active: item.present }" @click="item.present = true">P</button><button class="f-btn" :class="{ active: !item.present }" @click="item.present = false">F</button></div></li>
          </ul>
        </div>
      </div>
    </main>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false"><div class="modal-content"><div class="modal-header"><h3>{{ selectedStudentData?.name }}</h3><div class="modal-actions"><button class="whatsapp-btn" @click="sendWhatsapp">📱 Cobrar</button><button class="close-btn" @click="showModal = false">✖</button></div></div><div class="modal-body"><p v-if="studentPendingTasks.length === 0" class="empty-msg">Nenhuma pendência! 🎉</p><ul v-else class="task-list"><li v-for="item in studentPendingTasks" :key="item.id"><div class="task-row"><strong>{{ item.taskTitle }}</strong><small>{{ item.courseName }}</small></div><span class="status-badge">Pendente</span></li></ul></div></div></div>
    <div v-if="showAssignmentModal" class="modal-overlay" @click.self="showAssignmentModal = false"><div class="modal-content"><div class="modal-header"><h3 style="color: #4ade80;">{{ selectedAssignment?.title }}</h3><button class="close-btn" @click="showAssignmentModal = false">✖</button></div><div class="modal-body"><p v-if="assignmentPendingList.length === 0" class="empty-msg">Ninguém deve! 🎉</p><ul v-else class="student-list-modal"><li v-for="student in assignmentPendingList" :key="student.id"><span class="student-name-modal">{{ student.name }}</span><button class="mini-whatsapp-btn" @click.stop="cobrarIndividual(student.firstName, selectedAssignment.title)">📱</button></li></ul></div></div></div>
  </div>
</template>

<style scoped>
/* BASE */
:global(body) { background-color: #121212; color: #e0e0e0; font-family: 'Segoe UI', sans-serif; margin: 0; }
.container { max-width: 1100px; margin: 0 auto; padding: 20px; }
.header-top { display: flex; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
.course-filter { background: #2a2a2a; color: white; border: 1px solid #444; padding: 10px; border-radius: 6px; }
.tabs { display: flex; gap: 15px; margin-bottom: 25px; border-bottom: 1px solid #333; overflow-x: auto; }
.tabs button { background: none; border: none; color: #888; font-size: 1.1rem; padding: 10px 20px; cursor: pointer; border-bottom: 3px solid transparent; white-space: nowrap; }
.tabs button.active { color: #4ade80; border-bottom: 3px solid #4ade80; font-weight: bold; }
.dashboard-grid { display: grid; grid-template-columns: 70% 28%; justify-content: space-between; gap: 20px; margin-bottom: 30px; }
.card { background: #1e1e1e; padding: 20px; border-radius: 12px; border: 1px solid #333; }
.main-chart-section { grid-column: 1 / 2; min-width: 0; }
.main-chart-section h3 { margin-top: 0; color: #888; font-size: 1rem; margin-bottom: 15px; }
.kpi-section { display: flex; flex-direction: column; gap: 15px; grid-column: 2 / 3; }
.kpi-card { background: #1e1e1e; padding: 20px; border-radius: 12px; border: 1px solid #333; display: flex; flex-direction: column; justify-content: center; position: relative; height: 100%; }
.kpi-card .label { font-size: 0.8rem; color: #888; text-transform: uppercase; }
.kpi-card .value { font-size: 2.2rem; font-weight: bold; color: #fff; margin-top: 5px; }
.kpi-card .value.green { color: #4ade80; }
.kpi-card .value.blue { color: #38bdf8; }
.mini-graph { position: absolute; right: 20px; top: 20px; font-size: 1.5rem; opacity: 0.5; }
.donuts-section { grid-column: 1 / 3; display: flex; justify-content: space-around; align-items: center; padding: 30px 20px; flex-wrap: wrap; gap: 20px; }
.student-list { list-style: none; padding: 0; }
.student-list li { background: #1e1e1e; padding: 15px; margin-bottom: 8px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border: 1px solid #333; }
.student-list li:hover { background: #2a2a2a; border-color: #4ade80; }
.student-info { display: flex; align-items: center; gap: 10px; }
.avatar { background: #333; padding: 5px 8px; border-radius: 50%; }
.assignments-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px; }
.assignment-card { cursor: pointer; transition: transform 0.2s; border: 1px solid #333; }
.assignment-card:hover { transform: translateY(-3px); border-color: #4ade80; }
.course-badge { background: #333; padding: 2px 8px; border-radius: 4px; color: #aaa; font-size: 0.8em; }
.stat-box { background: #2c1a1d; color: #fca5a5; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #5c2b2b; width: 100%; margin-top: auto; }
.stat-box .big-number { font-size: 1.5rem; font-weight: bold; display: block; }
.stat-box .label { font-size: 0.75rem; text-transform: uppercase; }
.empty-state-attendance { text-align: center; padding: 50px; color: #fca5a5; font-size: 1.2rem; background: #2c1a1d; border-radius: 8px; border: 1px dashed #ef4444; }
.attendance-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.attendance-controls { display: flex; gap: 10px; align-items: center; }
.lesson-picker { background: #2a2a2a; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 6px; min-width: 150px; font-size: 1rem; }
.save-btn { background: #38bdf8; color: #000; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; }
.save-btn:hover { background: #0ea5e9; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.attendance-item { cursor: default !important; }
.attendance-actions { display: flex; gap: 5px; }
.p-btn, .f-btn { width: 35px; height: 35px; border-radius: 50%; border: 2px solid #444; background: transparent; color: #444; font-weight: bold; cursor: pointer; transition: 0.2s; }
.p-btn.active { background: #4ade80; border-color: #4ade80; color: #000; }
.f-btn.active { background: #ef4444; border-color: #ef4444; color: #fff; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 999; backdrop-filter: blur(5px); }
.modal-content { background: #1e1e1e; width: 90%; max-width: 500px; border-radius: 10px; border: 1px solid #444; overflow: hidden; }
.modal-header { background: #252525; padding: 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; }
.modal-body { padding: 20px; max-height: 60vh; overflow-y: auto; }
.modal-actions { display: flex; gap: 10px; }
.whatsapp-btn { background-color: #25D366; color: #fff; border: none; padding: 8px 16px; border-radius: 20px; font-weight: bold; cursor: pointer; transition: transform 0.2s; }
.whatsapp-btn:hover { transform: scale(1.05); }
.mini-whatsapp-btn { background: #25D366; border: none; border-radius: 50%; width: 35px; height: 35px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }
.mini-whatsapp-btn:hover { transform: scale(1.15); }
.close-btn { background: none; border: none; color: #aaa; cursor: pointer; font-size: 1.2rem; }
.task-list, .student-list-modal { list-style: none; padding: 0; }
.task-list li, .student-list-modal li { padding: 12px 0; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
.status-badge { background: #3f1818; color: #f87171; padding: 4px 8px; border-radius: 4px; font-size: 0.7em; font-weight: bold; }
@media (max-width: 900px) { .dashboard-grid { grid-template-columns: 1fr; } .donuts-section { flex-direction: column; gap: 20px; } }
</style>