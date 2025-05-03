<script setup lang="ts">
import type { ArticleData } from "../../feature/trends";

defineProps<{
  articles: ArticleData[];
}>();

const openUserPage = (username: string) => {
  window.open(`https://zenn.dev/${username}`, "_blank");
};

const openArticlePage = (username: string, _articleId: number, slug: string) => {
  // Zennの記事ページURLのフォーマットに従う
  window.open(`https://zenn.dev/${username}/articles/${slug}`, "_blank");
};
</script>

<template>
  <el-table :data="articles" style="width: 100%">
    <el-table-column label="順位" width="70">
      <template #default="scope">
        {{ scope.$index + 1 }}
      </template>
    </el-table-column>

    <el-table-column label="ユーザー" width="250">
      <template #default="scope">
        <div class="user-info" @click="openUserPage(scope.row.user.username)">
          <el-avatar :size="40" :src="scope.row.user.avatarSmallUrl">
            {{ scope.row.user.name.charAt(0) }}
          </el-avatar>
          <span class="username">{{ scope.row.user.name }}</span>
        </div>
      </template>
    </el-table-column>

    <el-table-column label="記事タイトル">
      <template #default="scope">
        <div class="article-title" @click="openArticlePage(scope.row.user.username, scope.row.id, scope.row.slug)">
          {{ scope.row.title }}
        </div>
      </template>
    </el-table-column>

    <el-table-column label="いいね数" width="100" prop="likedCount" />
    <el-table-column label="コメント数" width="100" prop="commentsCount" />
  </el-table>
</template>

<style scoped>
.user-info {
  display: flex;
  align-items: center;
  cursor: pointer;
}
.username {
  margin-left: 10px;
}
.article-title {
  cursor: pointer;
  color: #409eff;
}
.article-title:hover {
  text-decoration: underline;
}
</style>
