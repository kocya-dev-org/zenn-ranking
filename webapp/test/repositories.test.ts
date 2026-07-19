import {
  DEFAULT_REPOSITORY_COLOR,
  loadRepositories,
  parseRepositoriesText,
  saveRepositories,
  stringifyRepositories,
  useRepositorySettings,
} from "../src/feature/repositories";

const createStorageMock = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  };
};

describe("repositories", () => {
  beforeEach(() => {
    globalThis.localStorage = createStorageMock();
  });

  it("parses repository text", async () => {
    expect(parseRepositoriesText(" owner/one \n\nowner/two\r\n")).toEqual([
      { name: "owner/one", color: DEFAULT_REPOSITORY_COLOR },
      { name: "owner/two", color: DEFAULT_REPOSITORY_COLOR },
    ]);
  });

  it("stringifies repository names", () => {
    expect(
      stringifyRepositories([
        { name: "owner/one", color: "#111111" },
        { name: "owner/two", color: "#222222" },
      ]),
    ).toBe("owner/one\nowner/two");
  });

  it("migrates legacy stored repositories", () => {
    localStorage.setItem("zenn-ranking:repositories", JSON.stringify(["owner/one"]));
    expect(loadRepositories()).toEqual([
      { name: "owner/one", color: DEFAULT_REPOSITORY_COLOR },
    ]);

    localStorage.setItem(
      "zenn-ranking:repositories",
      JSON.stringify([{ name: "owner/two", color: "#222222" }, { name: "owner/three" }]),
    );
    expect(loadRepositories()).toEqual([
      { name: "owner/two", color: "#222222" },
      { name: "owner/three", color: DEFAULT_REPOSITORY_COLOR },
    ]);
  });

  it("round trips saved repositories", () => {
    const repositories = [{ name: "owner/one", color: "#111111" }];

    saveRepositories(repositories);

    expect(loadRepositories()).toEqual(repositories);
  });

  it("keeps draft independent from committed repositories", () => {
    const settings = useRepositorySettings();
    settings.addDraft();
    settings.draft.value[0].name = "original";
    settings.commit();
    settings.openDialog();
    settings.draft.value[0].name = "changed";

    expect(settings.repositories.value).toEqual([
      { name: "original", color: DEFAULT_REPOSITORY_COLOR },
    ]);
  });

  it("adds drafts without changing committed repositories", () => {
    const settings = useRepositorySettings();

    settings.openDialog();
    settings.addDraft();

    expect(settings.draft.value).toHaveLength(1);
    expect(settings.draft.value[0]).toEqual({ name: "", color: "#409eff" });
    expect(settings.repositories.value).toEqual([]);
  });

  it("removes a draft row without changing committed repositories", () => {
    const settings = useRepositorySettings();

    settings.addDraft();
    settings.addDraft();
    settings.draft.value[0].name = "first";
    settings.draft.value[1].name = "second";
    settings.removeDraft(0);

    expect(settings.draft.value.map((repository) => repository.name)).toEqual(["second"]);
    expect(settings.repositories.value).toEqual([]);
  });

  it("commits and persists the edited draft", () => {
    const settings = useRepositorySettings();

    settings.addDraft();
    settings.draft.value[0].name = "owner/one";
    settings.draft.value[0].color = "#123456";
    settings.commit();

    expect(settings.repositories.value).toEqual([{ name: "owner/one", color: "#123456" }]);
    expect(settings.repositoriesText.value).toBe("owner/one");
    expect(loadRepositories()).toEqual(settings.repositories.value);
  });

  it("cancels draft changes and clears the draft", () => {
    const settings = useRepositorySettings();

    settings.addDraft();
    settings.draft.value[0].name = "owner/one";
    settings.cancelDialog();

    expect(settings.repositories.value).toEqual([]);
    expect(settings.draft.value).toEqual([]);
  });
});
