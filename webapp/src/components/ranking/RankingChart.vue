<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from "vue";
import * as echarts from "echarts";
import type { TrendData } from "../../feature/trends";

/**
 * 文字列を指定された長さに制限し、必要に応じて省略記号を追加します
 * @param text 制限する文字列
 * @param maxLength 最大長（デフォルト: 20）
 * @returns 制限された文字列
 */
const truncateTitle = (text: string, maxLength: number = 20): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + "...";
};

const props = defineProps<{
  trendData: TrendData;
}>();

const emit = defineEmits<{
  (e: "dateSelected", index: number): void;
}>();

const chartRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

const initChart = () => {
  if (!chartRef.value) return;

  chart = echarts.init(chartRef.value);
  updateChart();

  // 日付選択のためのクリックイベントを追加
  chart.on("click", (params) => {
    // params.dataIndexはクリックされたデータポイントのインデックス
    emit("dateSelected", params.dataIndex);
  });

  window.addEventListener("resize", handleResize);
};

const updateChart = () => {
  if (!chart || !props.trendData) return;

  const { data } = props.trendData;

  // X軸のラベル（日付や週番号など）
  const xAxisLabels = data.map((item) => item.key);

  //
  // 全期間で出現する上位10記事のIDを収集
  const allArticleIds = new Set();
  data.forEach((dateData) => {
    dateData.articles.slice(0, 10).forEach((article) => {
      allArticleIds.add(article.id);
    });
  });
  const series = Array.from(allArticleIds).map((articleId) => {
    // 最初に出現する記事のタイトルを取得
    let articleTitle = "";
    for (const dateData of data) {
      const found = dateData.articles.find((a) => a.id === articleId);
      if (found) {
        articleTitle = found.title;
        break;
      }
    }

    const seriesData = data.map((item) => {
      const found = item.articles.find((a) => a.id === articleId);
      return found ? found.likedCount : null;
    });

    return {
      name: truncateTitle(articleTitle),
      type: "line",
      data: seriesData,
      smooth: true,
    };
  });

  const option = {
    textStyle: {
      fontFamily: "'Noto Sans JP', system-ui, Avenir, Helvetica, Arial, sans-serif"
    },
    tooltip: {
      trigger: "axis",
      formatter: function (params: { axisValueLabel: string; color: string; seriesName: string; value: number }[]) {
        let tooltipContent = params[0].axisValueLabel + "<br/>";

        params.forEach((param: { color: string; seriesName: string; value: number | null }) => {
          if (param.value) {
            // シリーズの色からマーカーを作成
            const colorSpan = `<span style="display:inline-block;margin-right:5px;border-radius:10px;width:10px;height:10px;background-color:${param.color};"></span>`;
            // マーカー、シリーズ名、いいね数を表示
            tooltipContent += `${colorSpan}${param.seriesName} (${param.value})<br/>`;
          }
        });

        return tooltipContent;
      },
    },
    legend: {
      data: series.map((s) => s.name),
      type: "scroll",
      orient: "horizontal",
      bottom: 0,
      textStyle: {
        fontFamily: "'Noto Sans JP', system-ui, Avenir, Helvetica, Arial, sans-serif"
      }
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: xAxisLabels,
    },
    yAxis: {
      type: "value",
      name: "いいね数",
    },
    series,
  };

  chart.setOption(option);
};

const handleResize = () => {
  chart?.resize();
};

watch(() => props.trendData, updateChart, { deep: true });

onMounted(initChart);
onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  // クリックイベントリスナーを削除
  chart?.off("click");
  chart?.dispose();
});
</script>

<template>
  <div ref="chartRef" style="width: 100%; height: 400px"></div>
</template>
