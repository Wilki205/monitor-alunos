<script setup>
import { computed } from 'vue'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale
} from 'chart.js'
import { Bar } from 'vue-chartjs'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const props = defineProps({
  courses: {
    type: Array,
    default: () => []
  },
  assignments: {
    type: Array,
    default: () => []
  },
  submissions: {
    type: Array,
    default: () => []
  },
  attendance: {
    type: Array,
    default: () => []
  }
})

const PENDING_STATES = ['CREATED', 'NEW', 'RECLAIMED_BY_STUDENT', 'MISSING']
const DELIVERED_STATES = ['TURNED_IN', 'RETURNED']

const safeCourses = computed(() => Array.isArray(props.courses) ? props.courses : [])
const safeAssignments = computed(() => Array.isArray(props.assignments) ? props.assignments : [])
const safeSubmissions = computed(() => Array.isArray(props.submissions) ? props.submissions : [])
const safeAttendance = computed(() => Array.isArray(props.attendance) ? props.attendance : [])

const normalizeLabel = (name) => {
  const safeName = String(name || 'Sem nome')
  const parts = safeName.split(' - ').map(part => part.trim()).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : safeName
}

const chartData = computed(() => {
  const labels = []
  const dataPending = []
  const dataDelivered = []
  const dataAttendance = []

  safeCourses.value.forEach((course) => {
    const courseId = String(course?.id ?? '')
    labels.push(normalizeLabel(course?.name))

    const courseAssignmentIds = safeAssignments.value
      .filter(a => String(a?.course_id ?? '') === courseId)
      .map(a => String(a?.id ?? ''))

    const courseSubs = safeSubmissions.value.filter(
      s => courseAssignmentIds.includes(String(s?.assignment_id ?? ''))
    )

    const pendingCount = courseSubs.filter(
      s => PENDING_STATES.includes(String(s?.state ?? '').toUpperCase())
    ).length

    const deliveredCount = courseSubs.filter(
      s => DELIVERED_STATES.includes(String(s?.state ?? '').toUpperCase())
    ).length

    const attendanceCount = safeAttendance.value.filter(
      a => String(a?.course_id ?? '') === courseId && Boolean(a?.present) === true
    ).length

    dataPending.push(pendingCount)
    dataDelivered.push(deliveredCount)
    dataAttendance.push(attendanceCount)
  })

  return {
    labels,
    datasets: [
      {
        label: 'Presenças',
        backgroundColor: '#3b82f6',
        data: dataAttendance,
        borderRadius: 6,
        stack: 'total',
        maxBarThickness: 42
      },
      {
        label: 'Entregues',
        backgroundColor: '#22c55e',
        data: dataDelivered,
        borderRadius: 6,
        stack: 'total',
        maxBarThickness: 42
      },
      {
        label: 'Pendentes',
        backgroundColor: '#ef4444',
        data: dataPending,
        borderRadius: 6,
        stack: 'total',
        maxBarThickness: 42
      }
    ]
  }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false
  },
  plugins: {
    legend: {
      display: true,
      labels: {
        color: '#334155',
        boxWidth: 14,
        boxHeight: 14,
        padding: 16,
        font: {
          size: 12,
          weight: 500
        }
      }
    },
    tooltip: {
      backgroundColor: '#ffffff',
      titleColor: '#0f172a',
      bodyColor: '#334155',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: 12
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      stacked: true,
      grid: {
        color: '#e5e7eb'
      },
      ticks: {
        color: '#64748b',
        precision: 0
      }
    },
    x: {
      stacked: true,
      grid: {
        display: false
      },
      ticks: {
        color: '#475569',
        maxRotation: 0,
        minRotation: 0
      }
    }
  }
}))
</script>

<template>
  <div class="chart-container">
    <div v-if="chartData.labels.length === 0" class="empty-state">
      Nenhuma turma encontrada para exibir o gráfico.
    </div>

    <Bar
      v-else
      :data="chartData"
      :options="chartOptions"
    />
  </div>
</template>

<style scoped>
.chart-container {
  min-height: 350px;
  width: 100%;
  padding: 18px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.empty-state {
  height: 314px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #64748b;
  font-size: 0.95rem;
  font-weight: 500;
}
</style>