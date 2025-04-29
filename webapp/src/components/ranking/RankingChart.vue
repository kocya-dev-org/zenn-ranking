<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { TrendData } from '../../feature/trends'

const props = defineProps<{
  trendData: TrendData
}>()

const chartRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const initChart = () => {
  if (!chartRef.value) return
  
  chart = echarts.init(chartRef.value)
  updateChart()
  
  window.addEventListener('resize', handleResize)
}

const updateChart = () => {
  if (!chart || !props.trendData) return
  
  const { data } = props.trendData
  
  // X軸のラベル（日付や週番号など）
  const xAxisLabels = data.map(item => item.key)
  
  // 上位5記事のデータを準備
  const topArticles = data[0].articles.slice(0, 5)
  const series = topArticles.map(article => {
    const seriesData = data.map(item => {
      const found = item.articles.find(a => a.id === article.id)
      return found ? found.likedCount : 0
    })
    
    return {
      name: article.title,
      type: 'line',
      data: seriesData,
      smooth: true,
    }
  })
  
  const option = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: topArticles.map(article => article.title),
      type: 'scroll',
      orient: 'horizontal',
      bottom: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisLabels
    },
    yAxis: {
      type: 'value',
      name: 'いいね数'
    },
    series
  }
  
  chart.setOption(option)
}

const handleResize = () => {
  chart?.resize()
}

watch(() => props.trendData, updateChart, { deep: true })

onMounted(initChart)
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})
</script>

<template>
  <div ref="chartRef" style="width: 100%; height: 400px;"></div>
</template>
