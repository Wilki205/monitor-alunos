import { ref, computed } from 'vue'
import { getDashboardData } from '../services/dashboardService'
import { normalizeId, normalizeText } from '../utils/helpers'
import { isTrackedAssignment, DELIVERED_STATES } from '../utils/assignmentRules'

export function useDashboardData() {
  const loading = ref(true)
  const selectedCourse = ref('all')

  const courses = ref([])
  const students = ref([])
  const assignments = ref([])
  const submissions = ref([])
  const allAttendance = ref([])

  async function fetchData() {
    loading.value = true

    try {
      const data = await getDashboardData()

      courses.value = data.courses
      students.value = data.students
      assignments.value = data.assignments
      submissions.value = data.submissions
      allAttendance.value = data.attendance
    } finally {
      loading.value = false
    }
  }

  const dashboardCourses = computed(() => {
    if (selectedCourse.value === 'all') return courses.value
    return courses.value.filter(c => normalizeId(c.id) === normalizeId(selectedCourse.value))
  })

  const dashboardAssignments = computed(() => {
    let result = assignments.value

    if (selectedCourse.value !== 'all') {
      result = result.filter(a => normalizeId(a.course_id) === normalizeId(selectedCourse.value))
    }

    return result.filter(isTrackedAssignment)
  })

  const dashboardSubmissions = computed(() => {
    const validAssignmentIds = dashboardAssignments.value.map(a => normalizeId(a.id))
    return submissions.value.filter(s => validAssignmentIds.includes(normalizeId(s.assignment_id)))
  })

  const dashboardStudents = computed(() => {
    if (selectedCourse.value === 'all') return students.value

    const activeStudentIds = new Set(
      dashboardSubmissions.value.map(s => normalizeId(s.student_id))
    )

    return students.value.filter(student => activeStudentIds.has(normalizeId(student.id)))
  })

  const dashboardAttendance = computed(() => {
    if (selectedCourse.value === 'all') return allAttendance.value
    return allAttendance.value.filter(item => normalizeId(item.course_id) === normalizeId(selectedCourse.value))
  })

  const coursesMap = computed(() =>
    new Map(courses.value.map(course => [normalizeId(course.id), course]))
  )

  const assignmentsMap = computed(() =>
    new Map(assignments.value.map(item => [normalizeId(item.id), item]))
  )

  const studentsMap = computed(() =>
    new Map(students.value.map(student => [normalizeId(student.id), student]))
  )

  const kpis = computed(() => {
    const uniqueLessons = new Set()

    dashboardAssignments.value.forEach(a => {
      const match = String(a.title || '').match(/Aula\s+(\d+)/i)
      if (match) uniqueLessons.add(`${normalizeId(a.course_id)}-Aula${match[1]}`)
      else uniqueLessons.add(normalizeId(a.id))
    })

    const totalClasses = uniqueLessons.size

    const totalDelivered = dashboardSubmissions.value.filter(
      s => DELIVERED_STATES.includes(String(s.state || '').toUpperCase())
    ).length

    const miniProjIds = dashboardAssignments.value
      .filter(a => normalizeText(a.title).includes('miniprojeto'))
      .map(a => normalizeId(a.id))

    const totalMiniDelivered = dashboardSubmissions.value.filter(
      s =>
        miniProjIds.includes(normalizeId(s.assignment_id)) &&
        DELIVERED_STATES.includes(String(s.state || '').toUpperCase())
    ).length

    return {
      totalClasses,
      totalDelivered,
      totalMiniDelivered
    }
  })

  const performanceStats = computed(() => {
    const targetStudents = dashboardStudents.value
    if (!targetStudents.length) return { general: 0, mini: 0, risk: 0 }

    let goodGeneral = 0
    let goodMini = 0
    let risk = 0

    targetStudents.forEach(student => {
      const studentSubs = dashboardSubmissions.value.filter(
        s => normalizeId(s.student_id) === normalizeId(student.id)
      )

      const deliveredGeneral = studentSubs.filter(
        s => DELIVERED_STATES.includes(String(s.state || '').toUpperCase())
      ).length

      const miniSubs = studentSubs.filter(s => {
        const task = assignmentsMap.value.get(normalizeId(s.assignment_id))
        return task && normalizeText(task.title).includes('miniprojeto')
      })

      const deliveredMini = miniSubs.filter(
        s => DELIVERED_STATES.includes(String(s.state || '').toUpperCase())
      ).length

      const totalAssignmentsStudent = studentSubs.length || 1
      const totalMiniStudent = miniSubs.length || 1

      const pctGeneral = (deliveredGeneral / totalAssignmentsStudent) * 100
      const pctMini = (deliveredMini / totalMiniStudent) * 100

      if (pctGeneral >= 60) goodGeneral++
      if (pctMini >= 60) goodMini++
      if (pctGeneral < 75) risk++
    })

    const total = targetStudents.length || 1

    return {
      general: Math.round((goodGeneral / total) * 100),
      mini: Math.round((goodMini / total) * 100),
      risk: Math.round((risk / total) * 100)
    }
  })

  return {
    loading,
    selectedCourse,
    courses,
    students,
    assignments,
    submissions,
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
  }
}