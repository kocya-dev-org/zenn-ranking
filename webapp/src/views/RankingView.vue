<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getTrends } from '../feature/trends'
import type { TrendData } from '../feature/trends'
import RankingChart from '../components/ranking/RankingChart.vue'
import RankingList from '../components/ranking/RankingList.vue'

const activeTimeUnit = ref('daily')
const trendData = ref<TrendData | null>(null)
const loading = ref(true)

const fetchData = async () => {
  loading.value = true
  try {
    // 日: 7日分、週: 4週分、月: 12ヶ月分のデータを取得
    const range = activeTimeUnit.value === 'daily' ? 7 : 
                  activeTimeUnit.value === 'weekly' ? 4 : 12
    trendData.value = await getTrends(activeTimeUnit.value, range)
  } catch (error) {
    console.error('Error fetching trend data:', error)
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)
watch(activeTimeUnit, fetchData)
</script>

<template>
  <div>
    <el-tabs v-model="activeTimeUnit" class="time-unit-tabs">
      <el-tab-pane label="daily" name="daily"></el-tab-pane>
      <el-tab-pane label="weekly" name="weekly"></el-tab-pane>
      <el-tab-pane label="monthly" name="monthly"></el-tab-pane>
    </el-tabs>

    <el-card class="chart-card">
      <template #header>
        <div class="chart-header">
          <h2>ランキング推移</h2>
        </div>
      </template>
      <div v-if="loading" class="loading">
        <el-skeleton :rows="6" animated />
      </div>
      <RankingChart v-else-if="trendData" :trend-data="trendData" />
    </el-card>

    <el-card class="ranking-card">
      <template #header>
        <div class="ranking-header">
          <h2>ランキング一覧</h2>
        </div>
      </template>
      <div v-if="loading" class="loading">
        <el-skeleton :rows="10" animated />
      </div>
      <RankingList v-else-if="trendData && trendData.data.length > 0" 
                   :articles="trendData.data[trendData.data.length - 1].articles" />
    </el-card>
  </div>
</template>

<style scoped>
.time-unit-tabs {
  margin-bottom: 20px;
}
.chart-card, .ranking-card {
  margin-bottom: 20px;
}
.loading {
  padding: 20px;
}
</style>
