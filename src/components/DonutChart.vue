<script setup>
import { computed } from 'vue'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'vue-chartjs'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps({
  percent: Number,
  color: String,
  label: String
})

const chartData = computed(() => ({
  labels: ['Concluído', 'Restante'],
  datasets: [{
    backgroundColor: [props.color, '#333'], 
    borderWidth: 0,
    data: [props.percent, 100 - props.percent]
  }]
}))

const chartOptions = {
  responsive: true,
  cutout: '75%', 
  plugins: { legend: { display: false }, tooltip: { enabled: false } }
}
</script>

<template>
  <div class="donut-wrapper">
    <div class="chart-box">
      <Doughnut :data="chartData" :options="chartOptions" />
      <div class="center-text">
        <span class="percent" :style="{ color: color }">{{ percent }}%</span>
      </div>
    </div>
    <p class="label">{{ label }}</p>
  </div>
</template>

<style scoped>
.donut-wrapper { display: flex; flex-direction: column; align-items: center; }
.chart-box { position: relative; width: 120px; height: 120px; }
.center-text {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  text-align: center; font-weight: bold; font-size: 1.5rem;
}
.label { margin-top: 10px; color: #888; font-size: 0.9rem; text-align: center; }
</style>