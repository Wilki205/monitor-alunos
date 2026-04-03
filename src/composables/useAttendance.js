import { ref, computed, watch } from 'vue'
import { getAttendanceByLesson, saveAttendanceRecords, getAllAttendance } from '../services/attendanceService'
import { normalizeId } from '../utils/helpers'

export function useAttendance({ selectedCourse, dashboardAssignments, dashboardStudents, allAttendance, showStatus }) {
  const attendanceLesson = ref('')
  const attendanceList = ref([])
  const savingAttendance = ref(false)

  const availableLessons = computed(() => {
    if (selectedCourse.value === 'all') return []

    const lessonsSet = new Set()

    dashboardAssignments.value.forEach(a => {
      const match = String(a.title || '').match(/(Aula\s+\d+)/i)
      if (match) lessonsSet.add(match[1])
    })

    const recordedLessons = new Set(
      allAttendance.value
        .filter(att => normalizeId(att.course_id) === normalizeId(selectedCourse.value))
        .map(att => att.lesson)
    )

    return Array.from(lessonsSet)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(lessonName => ({
        name: lessonName,
        done: recordedLessons.has(lessonName)
      }))
  })

  async function loadAttendanceData() {
    if (selectedCourse.value === 'all' || !attendanceLesson.value) {
      attendanceList.value = []
      return
    }

    try {
      const existingData = await getAttendanceByLesson(selectedCourse.value, attendanceLesson.value)

      attendanceList.value = dashboardStudents.value.map(student => {
        const record = existingData.find(r => normalizeId(r.student_id) === normalizeId(student.id))
        return {
          student_id: student.id,
          name: student.name,
          present: record ? Boolean(record.present) : true
        }
      })
    } catch (error) {
      attendanceList.value = []
      showStatus(error?.message || 'Erro ao carregar chamada.', 'error')
    }
  }

  async function saveAttendance() {
    if (selectedCourse.value === 'all') {
      showStatus('Selecione uma turma específica.', 'error')
      return
    }

    if (!attendanceLesson.value) {
      showStatus('Selecione uma aula.', 'error')
      return
    }

    savingAttendance.value = true

    try {
      const records = attendanceList.value.map(item => ({
        student_id: item.student_id,
        course_id: selectedCourse.value,
        lesson: attendanceLesson.value,
        present: item.present
      }))

      await saveAttendanceRecords(records)
      allAttendance.value = await getAllAttendance()

      showStatus('Chamada salva com sucesso.')
    } catch (error) {
      showStatus(error?.message || 'Erro ao salvar chamada.', 'error')
    } finally {
      savingAttendance.value = false
    }
  }

  watch(selectedCourse, () => {
    attendanceLesson.value = ''
    attendanceList.value = []
  })

  watch(availableLessons, (newVal) => {
    if (!newVal.length) {
      attendanceLesson.value = ''
      return
    }

    const exists = newVal.some(item => item.name === attendanceLesson.value)
    if (!exists) {
      const firstMissing = newVal.find(item => !item.done)
      attendanceLesson.value = firstMissing ? firstMissing.name : newVal[0].name
    }
  })

  return {
    attendanceLesson,
    attendanceList,
    savingAttendance,
    availableLessons,
    loadAttendanceData,
    saveAttendance
  }
}