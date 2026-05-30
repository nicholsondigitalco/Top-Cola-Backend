import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { OrderRecord } from "./types";

export interface PeriodAnalyticsRow {
  dateKey: string;
  label: string;
  orderCount: number;
  revenue: number;
  profit: number;
  cancelledCount: number;
}

/** @deprecated Use PeriodAnalyticsRow */
export type DailyAnalyticsRow = PeriodAnalyticsRow;

export type AnalyticsGranularity = "daily" | "weekly";

const DAY_MS = 24 * 60 * 60 * 1000;

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const emptyPeriodRow = (dateKey: string, label: string): PeriodAnalyticsRow => ({
  dateKey,
  label,
  orderCount: 0,
  revenue: 0,
  profit: 0,
  cancelledCount: 0
});

const addOrderToBucket = (bucket: PeriodAnalyticsRow, order: OrderRecord): void => {
  bucket.orderCount += 1;
  bucket.revenue = roundCurrency(bucket.revenue + Number(order.total ?? 0));
  bucket.profit = roundCurrency(bucket.profit + Number(order.gross_profit ?? 0));
  if (order.status === "cancelled") bucket.cancelledCount += 1;
};

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfWeek = (date: Date): Date => {
  const day = startOfDay(date);
  day.setDate(day.getDate() - day.getDay());
  return day;
};

const toDateKey = (date: Date): string => date.toLocaleDateString("en-CA");

const formatDailyLabel = (date: Date): string =>
  date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

const formatWeeklyLabel = (weekStart: Date): string => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${weekStart.toLocaleDateString(undefined, opts)} – ${weekEnd.toLocaleDateString(undefined, opts)}`;
};

export const getAnalyticsGranularity = (startLocal: string, endLocal: string): AnalyticsGranularity => {
  const startMs = new Date(startLocal).getTime();
  const endMs = new Date(endLocal).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "daily";
  const rangeMs = Math.abs(endMs - startMs);
  return rangeMs <= 7 * DAY_MS ? "daily" : "weekly";
};

export const getAnalyticsPeriodLabel = (granularity: AnalyticsGranularity): string =>
  granularity === "daily" ? "Daily Breakdown" : "Weekly Breakdown";

export const toDateTimeLocalValue = (date: Date): string => {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const defaultAnalyticsStart = (): string => {
  const start = new Date();
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return toDateTimeLocalValue(start);
};

export const defaultAnalyticsEnd = (): string => toDateTimeLocalValue(new Date());

export const filterOrdersInRange = (
  orders: OrderRecord[],
  startLocal: string,
  endLocal: string
): OrderRecord[] => {
  const startMs = new Date(startLocal).getTime();
  const endMs = new Date(endLocal).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return [];
  const from = Math.min(startMs, endMs);
  const to = Math.max(startMs, endMs);
  return orders.filter((order) => {
    const createdMs = new Date(order.created_at).getTime();
    return createdMs >= from && createdMs <= to;
  });
};

export const buildAnalyticsSummary = (orders: OrderRecord[]): AnalyticsSummary => {
  const revenue = roundCurrency(orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0));
  const profit = roundCurrency(orders.reduce((sum, order) => sum + Number(order.gross_profit ?? 0), 0));
  const orderCount = orders.length;
  return {
    orderCount,
    revenue,
    profit,
    averageOrderValue: orderCount > 0 ? roundCurrency(revenue / orderCount) : 0,
    cancelledCount: orders.filter((order) => order.status === "cancelled").length,
    completeCount: orders.filter((order) => order.status === "complete").length,
    pendingCount: orders.filter((order) => order.status === "pending").length
  };
};

export const buildDailyAnalytics = (orders: OrderRecord[]): PeriodAnalyticsRow[] => {
  const buckets = new Map<string, PeriodAnalyticsRow>();

  for (const order of orders) {
    const created = new Date(order.created_at);
    const dateKey = toDateKey(created);
    const bucket =
      buckets.get(dateKey) ??
      emptyPeriodRow(dateKey, formatDailyLabel(created));

    addOrderToBucket(bucket, order);
    buckets.set(dateKey, bucket);
  }

  return Array.from(buckets.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
};

export const buildWeeklyAnalytics = (orders: OrderRecord[]): PeriodAnalyticsRow[] => {
  const buckets = new Map<string, PeriodAnalyticsRow>();

  for (const order of orders) {
    const created = new Date(order.created_at);
    const weekStart = startOfWeek(created);
    const dateKey = toDateKey(weekStart);
    const bucket =
      buckets.get(dateKey) ?? emptyPeriodRow(dateKey, formatWeeklyLabel(weekStart));

    addOrderToBucket(bucket, order);
    buckets.set(dateKey, bucket);
  }

  return Array.from(buckets.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
};

export const buildChartAnalytics = (
  orders: OrderRecord[],
  startLocal: string,
  endLocal: string
): { granularity: AnalyticsGranularity; rows: PeriodAnalyticsRow[] } => {
  const granularity = getAnalyticsGranularity(startLocal, endLocal);
  const startMs = new Date(startLocal).getTime();
  const endMs = new Date(endLocal).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { granularity, rows: [] };
  }

  const from = new Date(Math.min(startMs, endMs));
  const to = new Date(Math.max(startMs, endMs));
  const aggregated =
    granularity === "daily" ? buildDailyAnalytics(orders) : buildWeeklyAnalytics(orders);
  const bucketMap = new Map(aggregated.map((row) => [row.dateKey, row]));
  const rows: PeriodAnalyticsRow[] = [];

  if (granularity === "daily") {
    for (let cursor = startOfDay(from); cursor <= startOfDay(to); cursor.setDate(cursor.getDate() + 1)) {
      const dateKey = toDateKey(cursor);
      rows.push(bucketMap.get(dateKey) ?? emptyPeriodRow(dateKey, formatDailyLabel(cursor)));
    }
    return { granularity, rows };
  }

  for (let cursor = startOfWeek(from); cursor <= startOfWeek(to); cursor.setDate(cursor.getDate() + 7)) {
    const dateKey = toDateKey(cursor);
    rows.push(bucketMap.get(dateKey) ?? emptyPeriodRow(dateKey, formatWeeklyLabel(cursor)));
  }

  return { granularity, rows };
};

export interface AnalyticsSummary {
  orderCount: number;
  revenue: number;
  profit: number;
  averageOrderValue: number;
  cancelledCount: number;
  completeCount: number;
  pendingCount: number;
}

const formatReportTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatMoney = (value: number): string => `$${value.toFixed(2)}`;

export const exportOrdersReportPdf = ({
  orders,
  startAt,
  endAt,
  summary
}: {
  orders: OrderRecord[];
  startAt: string;
  endAt: string;
  summary: AnalyticsSummary;
}): void => {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const generatedAt = new Date().toLocaleString();

  doc.setFontSize(18);
  doc.text("Top Cola Orders Report", 40, 40);
  doc.setFontSize(10);
  doc.text(`Range: ${formatReportTimestamp(startAt)} – ${formatReportTimestamp(endAt)}`, 40, 58);
  doc.text(`Generated: ${generatedAt}`, 40, 72);

  doc.setFontSize(11);
  doc.text(
    [
      `Orders: ${summary.orderCount}`,
      `Revenue: ${formatMoney(summary.revenue)}`,
      `Avg Order: ${formatMoney(summary.averageOrderValue)}`,
      `Complete: ${summary.completeCount}`,
      `Pending: ${summary.pendingCount}`,
      `Cancelled: ${summary.cancelledCount}`
    ].join("   |   "),
    40,
    90
  );

  autoTable(doc, {
    startY: 108,
    head: [["Order ID", "Placed", "Customer", "Status", "Payment", "Total", "Promo"]],
    body: orders.map((order) => [
      order.id,
      formatReportTimestamp(order.created_at),
      order.customer_name,
      order.status,
      order.payment_method === "zelle" ? "Zelle" : "Cash",
      formatMoney(Number(order.total ?? 0)),
      order.promo_code ?? "—"
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });

  const safeStart = startAt.replace(/[:T]/g, "-");
  const safeEnd = endAt.replace(/[:T]/g, "-");
  doc.save(`top-cola-orders-${safeStart}-to-${safeEnd}.pdf`);
};
