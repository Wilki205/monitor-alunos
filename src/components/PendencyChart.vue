<script setup>
import { computed } from 'vue'
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js'
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

const chartData = computed(() => {
  const labels = props.courses.map(c => {
    const parts = (c.name || '').split(' - ')
    return parts.length > 1 ? parts[parts.length - 1] : c.name
  })

  const PENDING = ['CREATED', 'NEW', 'RECLAIMED_BY_STUDENT', 'MISSING']
  const DELIVERED = ['TURNED_IN', 'RETURNED']

  const dataPending = []
  const dataDelivered = []
  const dataAttendance = []

  props.courses.forEach(course => {
    const courseId = String(course.id)

    // Atividades dessa turma (dados já vêm filtrados do pai,
    // aqui é só um filtro de segurança por course_id)
    const courseAssignmentIds = props.assignments
      .filter(a => String(a.course_id) === courseId)
      .map(a => a.id)

    const courseSubs = props.submissions
      .filter(s => courseAssignmentIds.includes(s.assignment_id))

    dataPending.push(
      courseSubs.filter(s => PENDING.includes(s.state)).length
    )
    dataDelivered.push(
      courseSubs.filter(s => DELIVERED.includes(s.state)).length
    )

    // Presenças dessa turma (present = true)
    const courseAtt = (props.attendance || [])
      .filter(a => String(a.course_id) === courseId && a.present)

    dataAttendance.push(courseAtt.length)
  })

  return {
    labels,
    datasets: [
      {
        label: 'Presenças',
        backgroundColor: '#3b82f6',
        data: dataAttendance,
        borderRadius: 4,
        stack: 'Stack 2'
      },
      {
        label: 'Entregues',
        backgroundColor: '#4ade80',
        data: dataDelivered,
        borderRadius: 4,
        stack: 'Stack 0'
      },
      {
        label: 'Pendentes',
        backgroundColor: '#ef4444',
        data: dataPending,
        borderRadius: 4,
        stack: 'Stack 1'
      }
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { 
      display: true, 
      labels: { color: '#e0e0e0' } 
    },
    tooltip: { 
      backgroundColor: '#1e1e1e', 
      titleColor: '#fff', 
      bodyColor: '#ccc', 
      borderColor: '#333', 
      borderWidth: 1, 
      mode: 'index', 
      intersect: false 
    }
  },
  scales: {
    y: { 
      beginAtZero: true, 
      grid: { color: '#333' }, 
      ticks: { color: '#888' } 
    },
    x: { 
      grid: { display: false }, 
      ticks: { color: '#aaa' } 
    }
  }
}
</script>

<template>
  <div class="chart-container">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.chart-container {
  height: 350px;
  width: 100%;
  padding: 15px;
  border-radius: 10px;
  border: 1px solid #333;
  background: #1e1e1e;
}

/* quando estiver dentro do container claro, herda melhor */
:global(.container.light) .chart-container {
  border-color: #d1d5db;
  background: #ffffff;
}
</style>
