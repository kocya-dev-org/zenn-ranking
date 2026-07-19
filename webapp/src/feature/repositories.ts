import { computed, ref, type ComputedRef, type Ref } from "vue";

/**
 * リポジトリ設定
 *
 * @property name - リポジトリ名。
 * @property color - 表示色。
 */
export interface RepositoryConfig {
  name: string;
  color: string;
}

export const DEFAULT_REPOSITORY_COLOR = "#409eff";

const REPOSITORIES_STORAGE_KEY = "zenn-ranking:repositories";

/**
 * リポジトリ設定を作成します。
 *
 * @param name - リポジトリ名。
 * @param color - 表示色。
 * @returns リポジトリ設定。
 */
export const createRepositoryConfig = (
  name = "",
  color = DEFAULT_REPOSITORY_COLOR,
): RepositoryConfig => ({ name, color });

/**
 * テキストからリポジトリ設定を作成します。
 *
 * @param text - 1行1リポジトリのテキスト。
 * @returns リポジトリ設定の配列。
 */
export const parseRepositoriesText = (text: string): RepositoryConfig[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => createRepositoryConfig(name));

/**
 * リポジトリ設定をテキストに変換します。
 *
 * @param repos - リポジトリ設定の配列。
 * @returns 1行1リポジトリのテキスト。
 */
export const stringifyRepositories = (repos: RepositoryConfig[]): string =>
  repos.map((repo) => repo.name).join("\n");

/**
 * 保存済みのリポジトリ設定を読み込みます。
 *
 * @returns リポジトリ設定の配列。
 */
export const loadRepositories = (): RepositoryConfig[] => {
  try {
    const raw = localStorage.getItem(REPOSITORIES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) =>
        typeof item === "string"
          ? createRepositoryConfig(item)
          : createRepositoryConfig(
              (item as { name?: string } | null)?.name ?? "",
              (item as { color?: string } | null)?.color ?? DEFAULT_REPOSITORY_COLOR,
            ),
      );
    }
    if (typeof parsed === "string") {
      return parseRepositoriesText(parsed);
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * リポジトリ設定を保存します。
 *
 * @param repos - リポジトリ設定の配列。
 */
export const saveRepositories = (repos: RepositoryConfig[]): void => {
  localStorage.setItem(REPOSITORIES_STORAGE_KEY, JSON.stringify(repos));
};

/**
 * リポジトリ設定画面の状態を管理します。
 *
 * @returns リポジトリ設定の状態と操作。
 */
export const useRepositorySettings = (): {
  repositories: Ref<RepositoryConfig[]>;
  repositoriesText: ComputedRef<string>;
  draft: Ref<RepositoryConfig[]>;
  openDialog: () => void;
  addDraft: () => void;
  removeDraft: (index: number) => void;
  commit: () => void;
  cancelDialog: () => void;
} => {
  const repositories = ref<RepositoryConfig[]>(loadRepositories());
  const repositoriesText = computed(() => stringifyRepositories(repositories.value));
  const draft = ref<RepositoryConfig[]>([]);

  const openDialog = (): void => {
    draft.value = repositories.value.map((repo) => ({ ...repo }));
  };

  const addDraft = (): void => {
    draft.value.push(createRepositoryConfig());
  };

  const removeDraft = (index: number): void => {
    draft.value.splice(index, 1);
  };

  const commit = (): void => {
    repositories.value = draft.value.map((repo) => ({ ...repo }));
    saveRepositories(repositories.value);
  };

  const cancelDialog = (): void => {
    draft.value = [];
  };

  return {
    repositories,
    repositoriesText,
    draft,
    openDialog,
    addDraft,
    removeDraft,
    commit,
    cancelDialog,
  };
};
