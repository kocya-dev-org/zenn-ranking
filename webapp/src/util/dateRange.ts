import type dayjs from "dayjs";

export type DateRange = {
  start: string;
  end: string;
};

/**
 * 指定された単位、基準日、範囲に基づいて日付範囲を取得します。
 *
 * @param unit - 日付範囲を計算する単位。例: "day", "week", "month"。
 * @param targetDate - 範囲の基準となる日付を表す `dayjs.Dayjs` オブジェクト。
 * @param range - 範囲の長さを指定する数値。
 * @returns 指定された単位と範囲に基づいた日付範囲を表す `DateRange` オブジェクト。
 * @throws エラー - サポートされていない単位が指定された場合にスローされます。
 */
export const getDateRange = (unit: string, targetDate: dayjs.Dayjs, range: number): DateRange => {
  if (range <= 0) {
    throw new Error("Range must be a positive number.");
  }
  switch (unit) {
    case "day":
      return getDateRangeByDay(targetDate, range);
    case "week":
      return { start: "dummy", end: "dummy" };
    case "month":
      return { start: "dummy", end: "dummy" };
    default:
      throw new Error(`Unsupported unit: ${unit}`);
  }
};

/**
 * 指定された日付を基準に、指定された範囲の日付範囲を取得します。
 *
 * @param targetDate - 範囲の基準となる日付 (dayjs.Dayjs オブジェクト)。
 * @param range - 日付範囲の長さ (日数)。範囲は targetDate を含み、過去に遡る形で計算されます。
 * @returns 日付範囲オブジェクト。開始日 (`start`) と終了日 (`end`) は "YYYY-MM-DD" 形式の文字列として返されます。
 */
export const getDateRangeByDay = (targetDate: dayjs.Dayjs, range: number): DateRange => {
  const start = targetDate.subtract(range - 1, "day");
  const end = targetDate;
  return { start: start.format("YYYY-MM-DD"), end: end.format("YYYY-MM-DD") };
};
