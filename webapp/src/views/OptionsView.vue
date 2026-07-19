<script setup lang="ts">
import { ref } from "vue";
import RepositorySettingsDialog from "../components/RepositorySettingsDialog.vue";
import { useRepositorySettings } from "../feature/repositories";

const {
  repositoriesText,
  draft,
  openDialog,
  addDraft,
  removeDraft,
  commit,
  cancelDialog,
} = useRepositorySettings();
const dialogVisible = ref(false);

const openSettings = (): void => {
  openDialog();
  dialogVisible.value = true;
};

const onOk = (): void => {
  commit();
  dialogVisible.value = false;
};

const onCancel = (): void => {
  cancelDialog();
  dialogVisible.value = false;
};

const onAdd = (): void => {
  addDraft();
};

const onDelete = (index: number): void => {
  removeDraft(index);
};
</script>

<template>
  <div class="options-container">
    <el-card>
      <h2>リポジトリ設定</h2>
      <el-button type="primary" @click="openSettings">リポジトリ設定</el-button>
      <el-input
        :model-value="repositoriesText"
        type="textarea"
        readonly
        autosize
        class="repository-display"
      />
    </el-card>
    <RepositorySettingsDialog
      v-model:visible="dialogVisible"
      :draft="draft"
      @add="onAdd"
      @delete="onDelete"
      @ok="onOk"
      @cancel="onCancel"
    />
  </div>
</template>

<style scoped>
.options-container {
  padding: 20px 0;
}

.repository-display {
  margin-top: 16px;
}
</style>
