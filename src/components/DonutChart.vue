<script setup>
import { computed } from 'vue'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'vue-chartjs'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps({
  percent: {
    type: Number,
    default: 0
  },
  color: {
    type: String,
    default: '#2563eb'
  },
  label: {
    type: String,
    default: 'Indicador'
  }
})

const safePercent = computed(() => {
  const value = Number(props.percent)
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
})

const formattedPercent = computed(() => `${Math.round(safePercent.value)}%`)

const chartData = computed(() => ({
  labels: ['Concluído', 'Restante'],
  datasets: [
    {
      data: [safePercent.value, 100 - safePercent.value],
      backgroundColor: [props.color, '#e5e7eb'],
      borderColor: ['#ffffff', '#ffffff'],
      borderWidth: 2,
      hoverOffset: 4
    }
  ]
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '76%',
  plugins: {
    legend: { display: false },
    tooltip: { enabled: false }
  }
}))
</script>

<template>
  <div class="donut-wrapper">
    <div class="chart-box">
      <Doughnut :data="chartData" :options="chartOptions" />
      <div class="center-text">
        <span class="percent" :style="{ color: color }">{{ formattedPercent }}</span>
      </div>
    </div>
    <p class="label">{{ label }}</p>
  </div>
</template>

<style scoped>
.donut-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.chart-box {
  position: relative;
  width: 120px;
  height: 120px;
}

.center-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.percent {
  font-weight: 700;
  font-size: 1.35rem;
  line-height: 1;
}

.label {
  margin: 0;
  color: #475569;
  font-size: 0.95rem;
  font-weight: 500;
  text-align: center;
}
</style>