<script setup lang="ts">
</script>

<template>
  <div class="about-container">
    <el-card>
      <h2>Zenn Rankingについて</h2>
      <p>このサイトはZennの記事を「いいね」数に基づいてランキング化したものです。</p>
      <p>集計単位は日、週、月単位で選択でき、それぞれの期間でのランキング上位10位を確認できます。</p>
      <p>折れ線グラフではランキングの推移を可視化し、トレンドを把握することができます。</p>
      <h3>集計対象</h3>
      <ul>
        <li>日単位: 1週間のランキング推移</li>
        <li>週単位: 4週間のランキング推移</li>
        <li>月単位: 1年間のランキング推移</li>
      </ul>
      <p>集計対象は、その集計期間内に作成された記事を対象としています。</p>
    </el-card>
  </div>
</template>

<style scoped>
.about-container {
  padding: 20px 0;
}
ul {
  padding-left: 20px;
}
</style>
