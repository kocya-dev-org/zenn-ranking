import type dayjs from "dayjs";

/**
 * 指定された単位、基準日、範囲に基づいて日付範囲を取得します。
 *
 * @param unit - 日付範囲を計算する単位。例: "day", "week", "month"。
 * @param targetDate - 範囲の基準となる日付を表す `dayjs.Dayjs` オブジェクト。
 * @param range - 範囲の長さを指定する数値。
 * @returns 指定された単位と範囲に基づいた日付範囲を表す `DateRange` オブジェクト。
 *   "day": ["YYYY-MM-DD", "YYYY-MM-DD", ...]
 *   "week": ["YYYY-MM-DD", "YYYY-MM-DD", ...] ※週の始まり(月曜日)の日付文字列のリスト
 *   "month": ["YYYY-MM", "YYYY-MM", ...]
 * @throws エラー - サポートされていない単位が指定された場合にスローされます。
 */
export const getDateRange = (unit: string, targetDate: dayjs.Dayjs, range: number): string[] => {
  if (range <= 0) {
    throw new Error("Range must be a positive number.");
  }
  switch (unit) {
    case "day":
      return getDateRangeByDay(targetDate, range);
    case "week":
      return getDateRangeByWeek(targetDate, range);
    case "month":
      return getDateRangeByMonth(targetDate, range);
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
export const getDateRangeByDay = (targetDate: dayjs.Dayjs, range: number): string[] => {
  const start = targetDate.subtract(range - 1, "day");
  // startを起点に、0 <= n && n < range の範囲で日付文字列のリストを生成
  return Array.from({ length: range }, (_, n) => start.add(n, "day").format("YYYY-MM-DD"));
};

/**
 * 指定された日付を基準に、指定された範囲の週範囲を取得します。
 * 週は月曜日から日曜日として扱います。
 *
 * @param targetDate - 範囲の基準となる日付 (dayjs.Dayjs オブジェクト)。
 * @param range - 週範囲の長さ (週数)。範囲は targetDate を含む週から、過去に遡る形で計算されます。
 * @returns 各週の月曜日の日付を "YYYY-MM-DD" 形式の文字列として返します。
 */
export const getDateRangeByWeek = (targetDate: dayjs.Dayjs, range: number): string[] => {
  const dayOfWeek = targetDate.day();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const mondayOfTargetWeek = targetDate.subtract(daysToSubtract, "day");
  
  const start = mondayOfTargetWeek.subtract(range - 1, "week");
  
  // startを起点に、0 <= n && n < range の範囲で各週の月曜日の文字列のリストを生成
  return Array.from({ length: range }, (_, n) => start.add(n, "week").format("YYYY-MM-DD"));
};

/**
 * 指定された日付を基準に、指定された範囲の月範囲を取得します。
 *
 * @param targetDate - 範囲の基準となる日付 (dayjs.Dayjs オブジェクト)。
 * @param range - 月範囲の長さ (月数)。範囲は targetDate を含む月から、過去に遡る形で計算されます。
 * @returns 各月の日付を "YYYY-MM" 形式の文字列として返します。
 */
export const getDateRangeByMonth = (targetDate: dayjs.Dayjs, range: number): string[] => {
  const start = targetDate.subtract(range - 1, "month");
  
  // startを起点に、0 <= n && n < range の範囲で各月の文字列のリストを生成
  return Array.from({ length: range }, (_, n) => start.add(n, "month").format("YYYY-MM"));
};
