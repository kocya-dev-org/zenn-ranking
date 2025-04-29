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
    
    // trends.tsの関数は'day', 'week', 'month'を期待しているので変換
    const unitMap = {
      'daily': 'day',
      'weekly': 'week',
      'monthly': 'month'
    }
    const unit = unitMap[activeTimeUnit.value as keyof typeof unitMap]
    
    trendData.value = await getTrends(unit, range)
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
    <div class="time-unit-selector">
      <el-radio-group v-model="activeTimeUnit" size="large">
        <el-radio-button label="daily">daily</el-radio-button>
        <el-radio-button label="weekly">weekly</el-radio-button>
        <el-radio-button label="monthly">monthly</el-radio-button>
      </el-radio-group>
    </div>

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
.time-unit-selector {
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
}
.chart-card, .ranking-card {
  margin-bottom: 20px;
}
.loading {
  padding: 20px;
}
</style>
