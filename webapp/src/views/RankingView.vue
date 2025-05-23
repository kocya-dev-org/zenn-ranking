<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getTrends } from '../feature/trends'
import type { TrendData } from '../feature/trends'
import RankingChart from '../components/ranking/RankingChart.vue'
import RankingList from '../components/ranking/RankingList.vue'

// activeTimeUnit ref removed as per Issue #32
const trendData = ref<TrendData | null>(null)
const loading = ref(true)
const selectedDateIndex = ref<number | null>(null) // 選択された日付のインデックス

/**
 * 日付文字列を「YYYY年M月D日」形式にフォーマットします
 * @param dateStr - フォーマットする日付文字列（例: '2025-05-05'）
 * @returns フォーマットされた日付文字列
 */
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}年${month}月${day}日`
}

const fetchData = async () => {
  loading.value = true
  try {
    // 日: 7日分のデータを取得
    const range = 7
    
    // 常にdailyを使用する
    const unit = 'day'
    
    trendData.value = await getTrends(unit, range)
  } catch (error) {
    console.error('Error fetching trend data:', error)
  } finally {
    loading.value = false
  }
}

// チャートでの日付選択を処理するメソッド
const handleDateSelected = (index: number) => {
  selectedDateIndex.value = index
}

onMounted(fetchData)
</script>

<template>
  <div>
    <!-- time-unit-selector has been removed as per Issue #32 -->

    <el-card class="chart-card">
      <template #header>
        <div class="chart-header">
          <h2>ランキング推移</h2>
        </div>
      </template>
      <div v-if="loading" class="loading">
        <el-skeleton :rows="6" animated />
      </div>
      <RankingChart v-else-if="trendData" :trend-data="trendData" @date-selected="handleDateSelected" />
    </el-card>

    <el-card class="ranking-card">
      <template #header>
        <div class="ranking-header">
          <h2>ランキング一覧 {{ trendData && trendData.data.length > 0 ? 
            `(${formatDate(trendData.data[selectedDateIndex !== null ? selectedDateIndex : trendData.data.length - 1].key)})` 
            : '' }}</h2>
        </div>
      </template>
      <div v-if="loading" class="loading">
        <el-skeleton :rows="10" animated />
      </div>
      <RankingList v-else-if="trendData && trendData.data.length > 0" 
                   :articles="trendData.data[selectedDateIndex !== null ? selectedDateIndex : trendData.data.length - 1].articles" />
    </el-card>
  </div>
</template>

<style scoped>
/* time-unit-selector CSS removed as per Issue #32 */
.chart-card, .ranking-card {
  margin-bottom: 20px;
}
.loading {
  padding: 20px;
}
</style>
