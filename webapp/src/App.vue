<script setup lang="ts">
import { ref } from "vue";
import RankingView from "./views/RankingView.vue";
import AboutView from "./views/AboutView.vue";

const activeTab = ref("ranking");
</script>

<template>
  <div class="container">
    <header>
      <h1>Zenn Weekly Ranking</h1>
    </header>
    <main>
      <el-tabs v-model="activeTab" class="main-tabs">
        <el-tab-pane label="Ranking" name="ranking">
          <RankingView />
        </el-tab-pane>
        <el-tab-pane label="About" name="about">
          <AboutView />
        </el-tab-pane>
      </el-tabs>
    </main>
  </div>
</template>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
</style>
