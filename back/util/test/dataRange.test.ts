import dayjs from "dayjs";
import { getDateRange } from "../src/dateRange";

describe("getDateRange", () => {
  describe("day", () => {
    it("指定された範囲の日付範囲を正しく計算する", () => {
      // 基準日を設定
      const targetDate = dayjs("2023-10-10");
      const range = 5;

      // 関数を実行
      const result = getDateRange("day", targetDate, range);

      // 期待される結果
      const expected = ["2023-10-06", "2023-10-07", "2023-10-08", "2023-10-09", "2023-10-10"];

      // 検証
      expect(result).toEqual(expected);
    });

    it("範囲が1の場合、開始日と終了日が同じになる", () => {
      const targetDate = dayjs("2023-10-10");
      const range = 1;

      const result = getDateRange("day", targetDate, range);

      const expected = ["2023-10-10"];

      expect(result).toEqual(expected);
    });

    it("範囲が0の場合、エラーがスローされる", () => {
      const targetDate = dayjs("2023-10-10");
      const range = 0;

      expect(() => getDateRange("day", targetDate, range)).toThrow();
    });

    it("負の範囲が指定された場合、エラーがスローされる", () => {
      const targetDate = dayjs("2023-10-10");
      const range = -5;

      expect(() => getDateRange("day", targetDate, range)).toThrow();
    });

    it("非常に大きな範囲値でもメモリエラーが発生しない", () => {
      const targetDate = dayjs("2023-10-10");
      const range = 10000;

      // メモリエラーが発生しないことを確認
      expect(() => getDateRange("day", targetDate, range)).not.toThrow();
    });
  });

  describe("week", () => {
    it("指定された範囲の週範囲を正しく計算する", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 2;

      // 関数を実行
      const result = getDateRange("week", targetDate, range);

      // 期待される結果: 2025-04-30（水曜日）を含む週の月曜日は 2025-04-28
      const expected = ["2025-04-21", "2025-04-28"];

      // 検証
      expect(result).toEqual(expected);
    });

    it("指定日が日曜日の場合、前の週の月曜日を正しく計算する", () => {
      const targetDate = dayjs("2025-05-04");
      const range = 2;

      const result = getDateRange("week", targetDate, range);

      const expected = ["2025-04-21", "2025-04-28"];

      expect(result).toEqual(expected);
    });

    it("指定日が月曜日の場合、その日を週の始めとして計算する", () => {
      const targetDate = dayjs("2025-04-28");
      const range = 3;

      const result = getDateRange("week", targetDate, range);

      const expected = ["2025-04-14", "2025-04-21", "2025-04-28"];

      expect(result).toEqual(expected);
    });

    it("範囲が0の場合、エラーがスローされる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 0;

      expect(() => getDateRange("week", targetDate, range)).toThrow();
    });

    it("負の範囲が指定された場合、エラーがスローされる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = -3;

      expect(() => getDateRange("week", targetDate, range)).toThrow();
    });

    it("指定日が火曜日の場合、正しく計算する", () => {
      const targetDate = dayjs("2025-04-29"); // 火曜日
      const range = 2;

      const result = getDateRange("week", targetDate, range);

      const expected = ["2025-04-21", "2025-04-28"];

      expect(result).toEqual(expected);
    });

    it("指定日が木曜日の場合、正しく計算する", () => {
      const targetDate = dayjs("2025-05-01"); // 木曜日
      const range = 2;

      const result = getDateRange("week", targetDate, range);

      const expected = ["2025-04-21", "2025-04-28"];

      expect(result).toEqual(expected);
    });

    it("指定日が金曜日の場合、正しく計算する", () => {
      const targetDate = dayjs("2025-05-02"); // 金曜日
      const range = 2;

      const result = getDateRange("week", targetDate, range);

      const expected = ["2025-04-21", "2025-04-28"];

      expect(result).toEqual(expected);
    });

    it("指定日が土曜日の場合、正しく計算する", () => {
      const targetDate = dayjs("2025-05-03"); // 土曜日
      const range = 2;

      const result = getDateRange("week", targetDate, range);

      const expected = ["2025-04-21", "2025-04-28"];

      expect(result).toEqual(expected);
    });

    it("月末を含む週の計算を正しく行う", () => {
      const targetDate = dayjs("2025-04-30"); // 月末の水曜日
      const range = 3;

      const result = getDateRange("week", targetDate, range);

      const expected = ["2025-04-14", "2025-04-21", "2025-04-28"];

      expect(result).toEqual(expected);
    });

    it("年末を含む週の計算を正しく行う", () => {
      const targetDate = dayjs("2024-12-31"); // 年末の火曜日
      const range = 2;

      const result = getDateRange("week", targetDate, range);

      const expected = ["2024-12-23", "2024-12-30"];

      expect(result).toEqual(expected);
    });

    it("非常に大きな範囲値でもメモリエラーが発生しない", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 1000;

      // メモリエラーが発生しないことを確認
      expect(() => getDateRange("week", targetDate, range)).not.toThrow();
    });
  });

  describe("month", () => {
    it("指定された範囲の月範囲を正しく計算する", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 2;

      // 関数を実行
      const result = getDateRange("month", targetDate, range);

      // 期待される結果
      const expected = ["2025-03", "2025-04"];

      // 検証
      expect(result).toEqual(expected);
    });

    it("月をまたぐ範囲を正しく計算する", () => {
      const targetDate = dayjs("2025-01-10");
      const range = 3;

      const result = getDateRange("month", targetDate, range);

      const expected = ["2024-11", "2024-12", "2025-01"];

      expect(result).toEqual(expected);
    });

    it("範囲が1の場合、同じ月だけが含まれる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 1;

      const result = getDateRange("month", targetDate, range);

      const expected = ["2025-04"];

      expect(result).toEqual(expected);
    });

    it("範囲が0の場合、エラーがスローされる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 0;

      expect(() => getDateRange("month", targetDate, range)).toThrow();
    });

    it("負の範囲が指定された場合、エラーがスローされる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = -2;

      expect(() => getDateRange("month", targetDate, range)).toThrow();
    });

    it("うるう年を含む月範囲を正しく計算する", () => {
      const targetDate = dayjs("2024-03-15"); // 2024年はうるう年
      const range = 3;

      const result = getDateRange("month", targetDate, range);

      const expected = ["2024-01", "2024-02", "2024-03"];

      expect(result).toEqual(expected);
    });

    it("非常に大きな範囲値でもメモリエラーが発生しない", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 1000;

      // メモリエラーが発生しないことを確認
      expect(() => getDateRange("month", targetDate, range)).not.toThrow();
    });
  });

  describe("入力値のバリデーション", () => {
    it("サポートされていない単位が指定された場合、エラーがスローされる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 1;

      expect(() => getDateRange("invalid", targetDate, range)).toThrow("Unsupported unit: invalid");
    });

    it("空文字列の単位が指定された場合、エラーがスローされる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 1;

      expect(() => getDateRange("", targetDate, range)).toThrow("Unsupported unit: ");
    });

    it("null単位が指定された場合、エラーがスローされる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 1;

      expect(() => getDateRange(null as any, targetDate, range)).toThrow("Unsupported unit: null");
    });

    it("undefined単位が指定された場合、エラーがスローされる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 1;

      expect(() => getDateRange(undefined as any, targetDate, range)).toThrow("Unsupported unit: undefined");
    });
  });

  describe("連続性とパフォーマンステスト", () => {
    it("大きな範囲で日付の連続性が保たれる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 100;

      const result = getDateRange("day", targetDate, range);

      // 最初と最後の日付をチェック
      expect(result[0]).toBe("2025-01-21");
      expect(result[result.length - 1]).toBe("2025-04-30");
      expect(result).toHaveLength(100);

      // 連続性をチェック
      for (let i = 1; i < result.length; i++) {
        const prev = dayjs(result[i - 1]);
        const current = dayjs(result[i]);
        expect(current.diff(prev, "day")).toBe(1);
      }
    });

    it("大きな範囲で週の連続性が保たれる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 10;

      const result = getDateRange("week", targetDate, range);

      expect(result).toHaveLength(10);

      // 連続性をチェック（各要素は7日間隔）
      for (let i = 1; i < result.length; i++) {
        const prev = dayjs(result[i - 1]);
        const current = dayjs(result[i]);
        expect(current.diff(prev, "day")).toBe(7);
      }
    });

    it("大きな範囲で月の連続性が保たれる", () => {
      const targetDate = dayjs("2025-04-30");
      const range = 12;

      const result = getDateRange("month", targetDate, range);

      expect(result).toHaveLength(12);

      // 連続性をチェック（各要素は1ヶ月間隔）
      for (let i = 1; i < result.length; i++) {
        const prev = dayjs(result[i - 1]);
        const current = dayjs(result[i]);
        expect(current.diff(prev, "month")).toBe(1);
      }
    });
  });
});
