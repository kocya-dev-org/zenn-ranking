import { describe, it, expect } from "vitest";
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
  });
});
