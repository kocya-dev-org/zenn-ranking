<script setup lang="ts">
import { computed } from "vue";
import type { RepositoryConfig } from "../feature/repositories";

const props = defineProps<{
  visible: boolean;
  draft: RepositoryConfig[];
}>();

const emit = defineEmits<{
  "update:visible": [visible: boolean];
  add: [];
  delete: [index: number];
  ok: [];
  cancel: [];
}>();

const visibleProxy = computed({
  get: () => props.visible,
  set: (value: boolean) => emit("update:visible", value),
});
</script>

<template>
  <el-dialog v-model="visibleProxy" title="リポジトリ設定">
    <div v-for="(repository, index) in props.draft" :key="index" class="repository-row">
      <el-input v-model="repository.name" placeholder="owner/repo" />
      <el-color-picker v-model="repository.color" />
      <el-button type="danger" @click="emit('delete', index)">delete</el-button>
    </div>
    <el-button type="primary" @click="emit('add')">add</el-button>
    <template #footer>
      <el-button @click="emit('cancel'); visibleProxy = false">キャンセル</el-button>
      <el-button type="primary" @click="emit('ok'); visibleProxy = false">ok</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.repository-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
}

.repository-row .el-input {
  flex: 1;
}
</style>
