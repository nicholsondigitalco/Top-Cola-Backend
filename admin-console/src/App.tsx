import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ApiClient } from "./api";
import {
  buildAnalyticsSummary,
  buildChartAnalytics,
  defaultAnalyticsEnd,
  defaultAnalyticsStart,
  exportOrdersReportPdf,
  filterOrdersInRange,
  getAnalyticsPeriodLabel
} from "./analytics";
import type {
  NotificationEmail,
  OrderDetailItem,
  OrderMetrics,
  OrderRecord,
  OrderSettings,
  PricingRule,
  PricingTier,
  Product,
  ProductImage,
  ProductVariation,
  ProductCategory,
  PromoCode
} from "./types";

const API_BASE_DEFAULT = "http://localhost:4000";
type AdminRole = "orders" | "full";
const ADMIN_SESSION_KEY = "top-cola-admin-session";

interface AdminSession {
  token: string;
  role: AdminRole;
}

const readAdminSession = (): AdminSession | null => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed.token || (parsed.role !== "orders" && parsed.role !== "full")) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeAdminSession = (session: AdminSession | null): void => {
  if (!session) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return;
  }
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
};

type AdminTab = "products" | "promos" | "rules" | "categories" | "settings";
const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "promos", label: "Promo Codes" },
  { id: "rules", label: "Pricing Rules" },
  { id: "categories", label: "Categories" },
  { id: "settings", label: "Settings" }
];
const STATUS_OPTIONS: OrderRecord["status"][] = ["pending", "complete", "cancelled"];
const STATUS_LABELS: Record<OrderRecord["status"], string> = {
  pending: "Pending",
  complete: "Complete",
  cancelled: "Cancelled"
};
type AddModalKind = "product" | "promo" | "rule" | "category" | null;
type OrderDateFilter = "today" | "yesterday" | "last7" | "all";
interface ProductDraft {
  sku: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  basePrice: string;
  basePriceMethod: "unit" | "weighted";
  cogsPrice: string;
  cogsPriceMethod: "unit" | "weighted";
  categorySlug: string;
  pricingGroupSlug: string;
  active: boolean;
}

interface PendingProductImage {
  id: string;
  file: File;
  previewUrl: string;
  isPrimary: boolean;
}

interface OrderEditorItem {
  productId: string;
  productQuery: string;
  quantity: string;
  variationId?: string;
}

const EMPTY_PRODUCT_DRAFT: ProductDraft = {
  sku: "",
  name: "",
  shortDescription: "",
  longDescription: "",
  basePrice: "0",
  basePriceMethod: "unit",
  cogsPrice: "0",
  cogsPriceMethod: "unit",
  categorySlug: "vapes",
  pricingGroupSlug: "",
  active: true
};

const normalizeVariationId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

const normalizeVariationList = (entries: string[]): ProductVariation[] => {
  const seen = new Set<string>();
  const variations: ProductVariation[] = [];
  for (const entry of entries) {
    const id = normalizeVariationId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    variations.push({ id, name: entry });
  }
  return variations;
};

const roundUnitPrice = (value: number): number => Math.round((value + Number.EPSILON) * 1000) / 1000;

const roundWeightedPrice = (value: number): number => Math.round(value);

const formatDraftPrice = (value: number, mode: "unit" | "weighted"): string =>
  mode === "weighted" ? roundWeightedPrice(value).toString() : roundUnitPrice(value).toFixed(3);

const normalizeTagList = (entries: string[]): string[] => {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of entries) {
    const cleaned = entry.trim().toLowerCase();
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    tags.push(cleaned);
  }
  return tags;
};

const serializeProductTags = (tags: string[]): string => JSON.stringify(normalizeTagList(tags));

const parseProductTagsValue = (rawValue: string): string[] => {
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeTagList(parsed.map((entry) => String(entry)));
    }
  } catch {
    // Fall back to legacy comma-separated inline edits.
  }
  return normalizeTagList(
    rawValue
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
};

const formatScheduledTime = (value?: string | null): string => {
  if (!value) return "ASAP";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ASAP";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (targetDay.getTime() === today.getTime()) return `Today at ${time}`;
  if (targetDay.getTime() === tomorrow.getTime()) return `Tomorrow at ${time}`;

  const day = date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return `${day} at ${time}`;
};

const formatOrderPlacedTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (targetDay.getTime() === today.getTime()) return `Today at ${time}`;
  if (targetDay.getTime() === yesterday.getTime()) return `Yesterday at ${time}`;

  const day = date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return `${day} at ${time}`;
};

const formatProductTimestamp = (value?: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const formatProductMoney = (value: number | undefined): string => `$${Number(value ?? 0).toFixed(3)}`;

const formatOrderProfit = (profitDollars: number, orderTotal: number, role: AdminRole): string => {
  if (role === "full") {
    return `$${profitDollars.toFixed(2)}`;
  }
  if (orderTotal <= 0) return "0%";
  return `${((profitDollars / orderTotal) * 100).toFixed(1)}%`;
};

const formatProductNumber = (value: number | undefined): string => Number(value ?? 0).toFixed(3);

const truncateProductCell = (value: string, max = 72): string => {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
};

type ProductInlineColumn =
  | "name"
  | "sku"
  | "short_description"
  | "long_description"
  | "base_price"
  | "cogs_per_unit"
  | "variations"
  | "category_id"
  | "pricing_group_id"
  | "tags"
  | "active";

const getProductCellEditValue = (product: Product, column: ProductInlineColumn): string => {
  switch (column) {
    case "name":
      return product.name;
    case "sku":
      return product.sku ?? "";
    case "short_description":
      return product.short_description;
    case "long_description":
      return product.long_description;
    case "base_price":
      return roundUnitPrice(Number(product.base_price)).toFixed(3);
    case "cogs_per_unit":
      return roundUnitPrice(Number(product.cogs_per_unit ?? 0)).toFixed(3);
    case "variations":
      return (product.variations ?? []).map((variation) => variation.name).join(", ");
    case "category_id":
      return product.category_id;
    case "pricing_group_id":
      return product.pricing_group_id ?? "";
    case "tags":
      return serializeProductTags(product.tags ?? []);
    case "active":
      return product.active ? "true" : "false";
    default:
      return "";
  }
};

const parseInlineNumber = (rawValue: string, label: string): number => {
  const parsed = Number(rawValue.trim().replace(/^\$/, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return roundUnitPrice(parsed);
};

const buildProductInlinePatch = (column: ProductInlineColumn, rawValue: string): Record<string, unknown> => {
  const trimmed = rawValue.trim();
  switch (column) {
    case "name":
      if (trimmed.length < 2) throw new Error("Product name must be at least 2 characters.");
      return { name: trimmed };
    case "sku":
      if (trimmed && trimmed.length < 2) throw new Error("SKU must be at least 2 characters.");
      return { sku: trimmed || undefined };
    case "short_description":
      return { shortDescription: rawValue };
    case "long_description":
      return { longDescription: rawValue };
    case "base_price":
      return { basePrice: parseInlineNumber(rawValue, "Base price") };
    case "cogs_per_unit":
      return { cogsPerUnit: parseInlineNumber(rawValue, "COGS") };
    case "variations":
      return {
        variations: normalizeVariationList(
          trimmed
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      };
    case "category_id":
      if (trimmed.length < 2) throw new Error("Category ID must be at least 2 characters.");
      return { categorySlug: trimmed };
    case "pricing_group_id":
      return { pricingGroupSlug: trimmed || null };
    case "tags":
      return { tags: parseProductTagsValue(rawValue) };
    case "active": {
      const normalized = trimmed.toLowerCase();
      if (["true", "1", "yes", "active"].includes(normalized)) return { active: true };
      if (["false", "0", "no", "inactive"].includes(normalized)) return { active: false };
      throw new Error('Active must be "true" or "false".');
    }
    default:
      return {};
  }
};

const productInlineCellKey = (productId: string, column: string): string => `${productId}:${column}`;

type PromoInlineColumn =
  | "code"
  | "description"
  | "discount_type"
  | "discount_value"
  | "min_subtotal"
  | "max_discount"
  | "usage_limit"
  | "active";

const promoInlineCellKey = (promoId: string, column: string): string => `${promoId}:${column}`;

const formatPromoDiscountValue = (promo: PromoCode): string =>
  promo.discount_type === "percent"
    ? `${Number(promo.discount_value).toFixed(2)}%`
    : `$${Number(promo.discount_value).toFixed(2)}`;

const getPromoCellEditValue = (promo: PromoCode, column: PromoInlineColumn): string => {
  switch (column) {
    case "code":
      return promo.code;
    case "description":
      return promo.description ?? "";
    case "discount_type":
      return promo.discount_type;
    case "discount_value":
      return Number(promo.discount_value).toFixed(2);
    case "min_subtotal":
      return Number(promo.min_subtotal).toFixed(2);
    case "max_discount":
      return promo.max_discount == null ? "" : Number(promo.max_discount).toFixed(2);
    case "usage_limit":
      return promo.usage_limit == null ? "" : String(promo.usage_limit);
    case "active":
      return promo.active ? "true" : "false";
    default:
      return "";
  }
};

const buildPromoInlinePatch = (column: PromoInlineColumn, rawValue: string): Record<string, unknown> => {
  const trimmed = rawValue.trim();
  switch (column) {
    case "code":
      if (trimmed.length < 2) throw new Error("Promo code must be at least 2 characters.");
      return { code: trimmed };
    case "description":
      return { description: rawValue.trim() || null };
    case "discount_type":
      if (trimmed !== "percent" && trimmed !== "fixed") {
        throw new Error('Discount type must be "percent" or "fixed".');
      }
      return { discountType: trimmed };
    case "discount_value": {
      const parsed = Number(trimmed.replace(/^\$/, "").replace(/%$/, ""));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Discount value must be greater than 0.");
      }
      return { discountValue: parsed };
    }
    case "min_subtotal": {
      const parsed = Number(trimmed.replace(/^\$/, ""));
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("Minimum subtotal must be a non-negative number.");
      }
      return { minSubtotal: parsed };
    }
    case "max_discount": {
      if (!trimmed) return { maxDiscount: null };
      const parsed = Number(trimmed.replace(/^\$/, ""));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Max discount must be greater than 0.");
      }
      return { maxDiscount: parsed };
    }
    case "usage_limit": {
      if (!trimmed) return { usageLimit: null };
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Usage limit must be a positive whole number.");
      }
      return { usageLimit: parsed };
    }
    case "active": {
      const normalized = trimmed.toLowerCase();
      if (["true", "1", "yes", "active"].includes(normalized)) return { active: true };
      if (["false", "0", "no", "inactive"].includes(normalized)) return { active: false };
      throw new Error('Active must be "true" or "false".');
    }
    default:
      return {};
  }
};

const getOrderPromoCode = (order: OrderRecord): string | null => {
  const direct = order.promo_code?.trim();
  if (direct) return direct;
  const fromSnapshot = order.pricing_snapshot?.promoCode?.trim();
  return fromSnapshot || null;
};

const getCategoryTagStyle = (categorySlug?: string) => {
  if (!categorySlug) {
    return {
      color: "#334155",
      background: "#e2e8f0",
      border: "1px solid #cbd5e1"
    };
  }

  let hash = 0;
  for (let i = 0; i < categorySlug.length; i += 1) {
    hash = (hash << 5) - hash + categorySlug.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    color: `hsl(${hue}, 45%, 24%)`,
    background: `hsl(${hue}, 75%, 92%)`,
    border: `1px solid hsl(${hue}, 60%, 82%)`
  };
};

export function App() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? API_BASE_DEFAULT;
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(() => readAdminSession()?.token ?? null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(() => readAdminSession()?.role ?? null);
  const [status, setStatus] = useState("Sign in to continue");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [metrics, setMetrics] = useState<OrderMetrics | null>(null);
  const [settings, setSettings] = useState<OrderSettings>({
    minOrderAmount: 0,
    minDeliveryBufferMinutes: 45
  });
  const [notificationEmails, setNotificationEmails] = useState<NotificationEmail[]>([]);
  const [newNotificationEmail, setNewNotificationEmail] = useState({ email: "", name: "" });
  const [minOrderAmountInput, setMinOrderAmountInput] = useState("0");
  const [minDeliveryBufferInput, setMinDeliveryBufferInput] = useState("45");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productInlineEdit, setProductInlineEdit] = useState<{
    productId: string;
    column: ProductInlineColumn;
    value: string;
  } | null>(null);
  const [productInlineSaving, setProductInlineSaving] = useState<string | null>(null);
  const [productStarSaving, setProductStarSaving] = useState<string | null>(null);
  const [promoInlineEdit, setPromoInlineEdit] = useState<{
    promoId: string;
    column: PromoInlineColumn;
    value: string;
  } | null>(null);
  const [promoInlineSaving, setPromoInlineSaving] = useState<string | null>(null);
  const [promoSearch, setPromoSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<"all" | OrderRecord["status"]>("all");
  const [orderDateFilter, setOrderDateFilter] = useState<OrderDateFilter>("today");
  const [analyticsStartAt, setAnalyticsStartAt] = useState(defaultAnalyticsStart);
  const [analyticsEndAt, setAnalyticsEndAt] = useState(defaultAnalyticsEnd);
  const [analyticsDisplayMode, setAnalyticsDisplayMode] = useState<"table" | "graph">("graph");
  const [analyticsGraphMetric, setAnalyticsGraphMetric] = useState<"orders" | "revenue">("revenue");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [updatingOrderIds, setUpdatingOrderIds] = useState<string[]>([]);
  const [adminTab, setAdminTab] = useState<AdminTab>("products");

  const [productDraft, setProductDraft] = useState<ProductDraft>(EMPTY_PRODUCT_DRAFT);
  const [productVariationsDraft, setProductVariationsDraft] = useState<ProductVariation[]>([]);
  const [productTagsDraft, setProductTagsDraft] = useState<string[]>([]);
  const [variationInputValue, setVariationInputValue] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [pendingProductImages, setPendingProductImages] = useState<PendingProductImage[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isDragOverImageZone, setIsDragOverImageZone] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isOrderEditorOpen, setIsOrderEditorOpen] = useState(false);
  const [orderEditorLoading, setOrderEditorLoading] = useState(false);
  const [orderEditor, setOrderEditor] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    deliveryAddress: "",
    deliveryInstructions: "",
    paymentMethod: "cash" as "cash" | "zelle",
    promoCode: "",
    scheduledDeliveryTime: "",
    status: "pending" as OrderRecord["status"],
    customDiscount: "0",
    note: ""
  });
  const [orderEditorItems, setOrderEditorItems] = useState<OrderEditorItem[]>([]);
  const [isAddItemMenuOpen, setIsAddItemMenuOpen] = useState(false);
  const [newOrderItemDraft, setNewOrderItemDraft] = useState({ productQuery: "", quantity: "1" });
  const [orderQuotePreview, setOrderQuotePreview] = useState<{
    subtotal: number;
    total: number;
    savings: number;
    volumeDiscount: number;
    promoDiscount: number;
    items: Array<{ product_id: string; line_total: number; quantity: number }>;
  } | null>(null);

  const [newPromo, setNewPromo] = useState({
    code: "",
    discountType: "percent" as "percent" | "fixed",
    discountValue: "10",
    minSubtotal: "0",
    active: true,
    description: ""
  });
  const [newCategory, setNewCategory] = useState({ slug: "", name: "" });
  const [newRule, setNewRule] = useState({
    slug: "",
    name: "",
    pricingGroupId: "",
    metric: "units" as "units" | "grams",
    firstTierMin: "1",
    firstTierType: "none" as PricingTier["adjustment_type"],
    firstTierValue: "0"
  });
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [activeAddModal, setActiveAddModal] = useState<AddModalKind>(null);

  const client = useMemo(() => new ApiClient(apiBaseUrl, token), [apiBaseUrl, token]);

  const loadCategories = async (showError = false) => {
    if (!token) return;
    try {
      const categoriesRes = await client.request<{ categories: ProductCategory[] }>("/admin/categories");
      setCategories(categoriesRes.categories);
    } catch (err) {
      if (showError) {
        setError((err as Error).message);
      }
    }
  };

  const loadOrdersData = async () => {
    if (!token) return;
    setIsBusy(true);
    setStatus("Loading orders...");
    setError(null);
    try {
      const [productsRes, ordersRes, metricsRes] = await Promise.all([
        client.request<{ products: Product[] }>("/admin/products"),
        client.request<{ orders: OrderRecord[] }>("/admin/orders"),
        client.request<OrderMetrics>("/admin/metrics/orders")
      ]);
      setProducts(productsRes.products);
      setOrders(ordersRes.orders);
      setMetrics(metricsRes);
      setLastSyncedAt(new Date().toISOString());
      setStatus("Connected");
    } catch (err) {
      setError((err as Error).message);
      setStatus("Failed to load orders");
    } finally {
      setIsBusy(false);
    }
  };

  const loadAll = async () => {
    if (!token) return;
    setIsBusy(true);
    setStatus("Loading admin data...");
    setError(null);
    try {
      await loadCategories();
      const [productsRes, promosRes, rulesRes, ordersRes, metricsRes, settingsRes, notificationEmailsRes] = await Promise.all([
        client.request<{ products: Product[] }>("/admin/products"),
        client.request<{ promos: PromoCode[] }>("/admin/promos"),
        client.request<{ pricingRules: PricingRule[] }>("/admin/pricing-rules"),
        client.request<{ orders: OrderRecord[] }>("/admin/orders"),
        client.request<OrderMetrics>("/admin/metrics/orders"),
        client.request<OrderSettings>("/admin/settings/order-minimum"),
        client.request<{ emails: NotificationEmail[] }>("/admin/settings/notification-emails")
      ]);
      setProducts(productsRes.products);
      setPromos(promosRes.promos);
      setRules(rulesRes.pricingRules);
      setOrders(ordersRes.orders);
      setMetrics(metricsRes);
      setSettings(settingsRes);
      setNotificationEmails(notificationEmailsRes.emails);
      setMinOrderAmountInput(settingsRes.minOrderAmount.toString());
      setMinDeliveryBufferInput(settingsRes.minDeliveryBufferMinutes.toString());
      setLastSyncedAt(new Date().toISOString());
      setStatus("Connected");
    } catch (err) {
      setError((err as Error).message);
      setStatus("Failed to load admin data");
    } finally {
      setIsBusy(false);
    }
  };

  const reloadSessionData = async () => {
    if (adminRole === "full") {
      await loadAll();
      return;
    }
    await loadOrdersData();
  };

  useEffect(() => {
    if (!token || !adminRole) return;
    if (adminRole === "full") {
      void loadAll();
    } else {
      void loadOrdersData();
    }
  }, [token, adminRole]);

  useEffect(() => {
    const syncSessionFromStorage = (event: StorageEvent) => {
      if (event.key !== ADMIN_SESSION_KEY) return;
      if (!event.newValue) {
        setToken(null);
        setAdminRole(null);
        return;
      }
      try {
        const session = JSON.parse(event.newValue) as AdminSession;
        if (!session.token || (session.role !== "orders" && session.role !== "full")) return;
        setToken(session.token);
        setAdminRole(session.role);
      } catch {
        // Ignore malformed session payloads from other tabs.
      }
    };
    window.addEventListener("storage", syncSessionFromStorage);
    return () => window.removeEventListener("storage", syncSessionFromStorage);
  }, []);

  useEffect(() => {
    if (!token || adminRole !== "full") return;
    if (adminTab === "products" || adminTab === "categories") {
      void loadCategories();
    }
  }, [token, adminRole, adminTab]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const publicClient = new ApiClient(apiBaseUrl, null);
      const result = await publicClient.request<{ token: string; role: AdminRole }>("/admin/login", "POST", {
        password
      });
      setAdminRole(result.role);
      setToken(result.token);
      writeAdminSession({ token: result.token, role: result.role });
      setPassword("");
      setStatus("Logged in");
    } catch (err) {
      setError((err as Error).message);
      setStatus("Login failed");
    } finally {
      setIsBusy(false);
    }
  };

  const logout = () => {
    writeAdminSession(null);
    setToken(null);
    setAdminRole(null);
    setProducts([]);
    setCategories([]);
    setPromos([]);
    setRules([]);
    setOrders([]);
    setMetrics(null);
    setSettings({
      minOrderAmount: 0,
      minDeliveryBufferMinutes: 45
    });
    setNotificationEmails([]);
    setMinOrderAmountInput("0");
    setMinDeliveryBufferInput("45");
    setLastSyncedAt(null);
    setStatus("Logged out");
  };

  const clearPendingProductImages = (images: PendingProductImage[] = pendingProductImages) => {
    for (const image of images) {
      URL.revokeObjectURL(image.previewUrl);
    }
    setPendingProductImages([]);
  };

  const openCreateProductModal = () => {
    setEditingProductId(null);
    setProductDraft(EMPTY_PRODUCT_DRAFT);
    setProductVariationsDraft([]);
    setProductTagsDraft([]);
    setProductImages([]);
    clearPendingProductImages();
    setVariationInputValue("");
    setActiveAddModal("product");
  };

  const loadProductImages = async (productId: string) => {
    const result = await client.request<{ images: ProductImage[] }>(`/admin/products/${productId}/images`);
    const sorted = [...result.images].sort((a, b) => {
      if (a.is_primary === b.is_primary) return a.sort_order - b.sort_order;
      return a.is_primary ? -1 : 1;
    });
    setProductImages(sorted);
  };

  const openEditProductModal = async (product: Product) => {
    setEditingProductId(product.id);
    setProductDraft({
      sku: product.sku ?? "",
      name: product.name,
      shortDescription: product.short_description ?? "",
      longDescription: product.long_description ?? "",
      basePrice: roundUnitPrice(Number(product.base_price)).toFixed(3),
      basePriceMethod: "unit",
      cogsPrice: roundUnitPrice(Number(product.cogs_per_unit ?? 0)).toFixed(3),
      cogsPriceMethod: "unit",
      categorySlug: product.category_slug,
      pricingGroupSlug: product.pricing_group_slug ?? "",
      active: product.active
    });
    setProductVariationsDraft(normalizeVariationList((product.variations ?? []).map((variation) => variation.name)));
    setProductTagsDraft(normalizeTagList(product.tags ?? []));
    clearPendingProductImages();
    await loadProductImages(product.id);
    setVariationInputValue("");
    setActiveAddModal("product");
  };

  const addVariationTag = () => {
    const nextName = variationInputValue.trim();
    if (!nextName) return;
    setProductVariationsDraft((current) => normalizeVariationList([...current.map((variation) => variation.name), nextName]));
    setVariationInputValue("");
  };

  const removeVariationTag = (variationId: string) => {
    setProductVariationsDraft((current) => current.filter((variation) => variation.id !== variationId));
  };

  const convertDraftValueBetweenModes = (
    rawValue: string,
    currentMode: "unit" | "weighted",
    nextMode: "unit" | "weighted"
  ): string => {
    const numericValue = Number(rawValue);
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
    if (currentMode === nextMode) return formatDraftPrice(safeValue, nextMode);
    const converted = currentMode === "unit" ? safeValue * 454 : safeValue / 454;
    return formatDraftPrice(converted, nextMode);
  };

  const addPendingProductImages = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setPendingProductImages((current) => {
      const shouldSetPrimary = current.length === 0;
      const added = imageFiles.map((file, index) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        isPrimary: shouldSetPrimary && index === 0
      }));
      return [...current, ...added];
    });
  };

  const removePendingProductImage = (imageId: string) => {
    setPendingProductImages((current) => {
      const target = current.find((image) => image.id === imageId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const remaining = current.filter((image) => image.id !== imageId);
      if (remaining.length > 0 && !remaining.some((image) => image.isPrimary)) {
        remaining[0] = { ...remaining[0], isPrimary: true };
      }
      return remaining;
    });
  };

  const setPendingImageAsPrimary = (imageId: string) => {
    setPendingProductImages((current) =>
      current.map((image) => ({ ...image, isPrimary: image.id === imageId }))
    );
  };

  const handleProductImageFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    if (editingProductId) {
      void uploadProductImages(imageFiles);
      return;
    }
    addPendingProductImages(imageFiles);
  };

  const uploadPendingImagesToProduct = async (productId: string, pending: PendingProductImage[]) => {
    if (pending.length === 0) return;
    const formData = new FormData();
    for (const image of pending) {
      formData.append("images", image.file);
    }
    const result = await client.requestFormData<{ images: ProductImage[] }>(
      `/admin/products/${productId}/images`,
      "POST",
      formData
    );
    const primaryIndex = pending.findIndex((image) => image.isPrimary);
    const uploadedPrimary = primaryIndex >= 0 ? result.images[primaryIndex] : undefined;
    if (uploadedPrimary && !uploadedPrimary.is_primary) {
      await client.request<{ images: ProductImage[] }>(
        `/admin/products/${productId}/images/${uploadedPrimary.id}/primary`,
        "PATCH"
      );
    }
  };

  const uploadProductImages = async (files: File[]) => {
    if (!editingProductId || files.length === 0) return;
    setIsUploadingImages(true);
    setError(null);
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("images", file);
      }
      await client.requestFormData<{ images: ProductImage[] }>(
        `/admin/products/${editingProductId}/images`,
        "POST",
        formData
      );
      await loadProductImages(editingProductId);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploadingImages(false);
      setIsDragOverImageZone(false);
    }
  };

  const markImageAsPrimary = async (imageId: string) => {
    if (!editingProductId) return;
    setIsBusy(true);
    setError(null);
    try {
      await client.request<{ images: ProductImage[] }>(
        `/admin/products/${editingProductId}/images/${imageId}/primary`,
        "PATCH"
      );
      await loadProductImages(editingProductId);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const deleteProductImage = async (imageId: string) => {
    if (!editingProductId) return;
    setIsBusy(true);
    setError(null);
    try {
      await client.request(`/admin/products/${editingProductId}/images/${imageId}`, "DELETE");
      await loadProductImages(editingProductId);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const closeProductModal = () => {
    setEditingProductId(null);
    setVariationInputValue("");
    setProductImages([]);
    clearPendingProductImages();
    setProductVariationsDraft([]);
    setProductTagsDraft([]);
    setProductDraft(EMPTY_PRODUCT_DRAFT);
    setActiveAddModal(null);
  };

  const deleteProduct = async () => {
    if (!editingProductId) return;
    const name = productDraft.name.trim() || editingProductId;
    if (!window.confirm(`Delete product "${name}"? This cannot be undone.`)) return;
    setIsBusy(true);
    setError(null);
    try {
      await client.request(`/admin/products/${editingProductId}`, "DELETE");
      setProducts((current) => current.filter((entry) => entry.id !== editingProductId));
      closeProductModal();
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      const toUnitValue = (rawValue: string, method: "unit" | "weighted", label: string): number => {
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(`${label} must be a non-negative number.`);
        }
        const unitValue = method === "weighted" ? roundWeightedPrice(parsed) / 454 : roundUnitPrice(parsed);
        return roundUnitPrice(unitValue);
      };
      const basePrice = toUnitValue(productDraft.basePrice, productDraft.basePriceMethod, "Base price");
      const cogsPerUnit = toUnitValue(productDraft.cogsPrice, productDraft.cogsPriceMethod, "COGS");
      const payload = {
        sku: productDraft.sku || undefined,
        name: productDraft.name,
        shortDescription: productDraft.shortDescription,
        longDescription: productDraft.longDescription,
        basePrice,
        cogsPerUnit,
        categorySlug: productDraft.categorySlug,
        pricingGroupSlug: productDraft.pricingGroupSlug || null,
        variations: productVariationsDraft,
        tags: productTagsDraft,
        active: productDraft.active
      };

      if (editingProductId) {
        await client.request<{ product: Product }>(`/admin/products/${editingProductId}`, "PATCH", payload);
      } else {
        const pendingImagesToUpload = [...pendingProductImages];
        const result = await client.request<{ product: Product }>("/admin/products", "POST", payload);
        if (pendingImagesToUpload.length > 0) {
          setIsUploadingImages(true);
          try {
            await uploadPendingImagesToProduct(result.product.id, pendingImagesToUpload);
          } finally {
            setIsUploadingImages(false);
          }
        }
        clearPendingProductImages(pendingImagesToUpload);
      }

      setEditingProductId(null);
      setProductDraft(EMPTY_PRODUCT_DRAFT);
      setProductVariationsDraft([]);
      setProductTagsDraft([]);
      setProductImages([]);
      setPendingProductImages([]);
      setVariationInputValue("");
      setActiveAddModal(null);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const startProductInlineEdit = (product: Product, column: ProductInlineColumn) => {
    setProductInlineEdit({
      productId: product.id,
      column,
      value: getProductCellEditValue(product, column)
    });
  };

  const cancelProductInlineEdit = () => {
    setProductInlineEdit(null);
  };

  const commitProductInlineEdit = async () => {
    if (!productInlineEdit) return;
    const product = products.find((entry) => entry.id === productInlineEdit.productId);
    if (!product) {
      setProductInlineEdit(null);
      return;
    }

    const originalValue = getProductCellEditValue(product, productInlineEdit.column);
    if (productInlineEdit.value === originalValue) {
      setProductInlineEdit(null);
      return;
    }

    await saveProductInlineField(product, productInlineEdit.column, productInlineEdit.value);
    setProductInlineEdit(null);
  };

  const saveProductInlineField = async (
    product: Product,
    column: ProductInlineColumn,
    rawValue: string
  ): Promise<boolean> => {
    const originalValue = getProductCellEditValue(product, column);
    if (rawValue === originalValue) return true;

    const cellKey = productInlineCellKey(product.id, column);
    setProductInlineSaving(cellKey);
    setError(null);
    try {
      const patch = buildProductInlinePatch(column, rawValue);
      const result = await client.request<{ product: Product }>(`/admin/products/${product.id}`, "PATCH", patch);
      setProducts((current) => current.map((entry) => (entry.id === product.id ? result.product : entry)));
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setProductInlineSaving(null);
    }
  };

  const handleProductSelectFieldChange = async (
    product: Product,
    column: ProductInlineColumn,
    value: string
  ) => {
    const ok = await saveProductInlineField(product, column, value);
    if (ok) cancelProductInlineEdit();
  };

  const toggleProductStar = async (product: Product) => {
    const nextStarred = !product.is_starred;
    setProductStarSaving(product.id);
    setError(null);
    try {
      const result = await client.request<{ product: Product }>(`/admin/products/${product.id}`, "PATCH", {
        isStarred: nextStarred
      });
      setProducts((current) => current.map((entry) => (entry.id === product.id ? result.product : entry)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProductStarSaving(null);
    }
  };

  const startPromoInlineEdit = (promo: PromoCode, column: PromoInlineColumn) => {
    setPromoInlineEdit({
      promoId: promo.id,
      column,
      value: getPromoCellEditValue(promo, column)
    });
  };

  const cancelPromoInlineEdit = () => {
    setPromoInlineEdit(null);
  };

  const savePromoInlineField = async (
    promo: PromoCode,
    column: PromoInlineColumn,
    rawValue: string
  ): Promise<boolean> => {
    const originalValue = getPromoCellEditValue(promo, column);
    if (rawValue === originalValue) return true;

    const cellKey = promoInlineCellKey(promo.id, column);
    setPromoInlineSaving(cellKey);
    setError(null);
    try {
      const patch = buildPromoInlinePatch(column, rawValue);
      const result = await client.request<{ promo: PromoCode }>(`/admin/promos/${promo.id}`, "PATCH", patch);
      setPromos((current) => current.map((entry) => (entry.id === promo.id ? result.promo : entry)));
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setPromoInlineSaving(null);
    }
  };

  const commitPromoInlineEdit = async () => {
    if (!promoInlineEdit) return;
    const promo = promos.find((entry) => entry.id === promoInlineEdit.promoId);
    if (!promo) {
      setPromoInlineEdit(null);
      return;
    }
    await savePromoInlineField(promo, promoInlineEdit.column, promoInlineEdit.value);
    setPromoInlineEdit(null);
  };

  const handlePromoSelectFieldChange = async (promo: PromoCode, column: PromoInlineColumn, value: string) => {
    const ok = await savePromoInlineField(promo, column, value);
    if (ok) cancelPromoInlineEdit();
  };

  const deletePromo = async (promo: PromoCode) => {
    if (!window.confirm(`Delete promo code "${promo.code}"? This cannot be undone.`)) return;
    setIsBusy(true);
    setError(null);
    try {
      await client.request(`/admin/promos/${promo.id}`, "DELETE");
      setPromos((current) => current.filter((entry) => entry.id !== promo.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const createPromo = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      await client.request<{ promo: PromoCode }>("/admin/promos", "POST", {
        code: newPromo.code,
        discountType: newPromo.discountType,
        discountValue: Number(newPromo.discountValue),
        minSubtotal: Number(newPromo.minSubtotal),
        active: newPromo.active,
        description: newPromo.description
      });
      setNewPromo((prev) => ({ ...prev, code: "", description: "" }));
      setActiveAddModal(null);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const createCategory = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      await client.request<{ category: ProductCategory }>("/admin/categories", "POST", newCategory);
      setNewCategory({ slug: "", name: "" });
      setActiveAddModal(null);
      await loadCategories(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const createRule = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      await client.request<{ pricingRule: PricingRule }>("/admin/pricing-rules", "POST", {
        slug: newRule.slug,
        name: newRule.name,
        pricingGroupId: newRule.pricingGroupId,
        metric: newRule.metric,
        tiers: [
          {
            min: Number(newRule.firstTierMin),
            adjustment_type: newRule.firstTierType,
            adjustment_value: Number(newRule.firstTierValue)
          }
        ],
        constraints: {}
      });
      setNewRule({
        slug: "",
        name: "",
        pricingGroupId: "",
        metric: "units",
        firstTierMin: "1",
        firstTierType: "none",
        firstTierValue: "0"
      });
      setActiveAddModal(null);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const renameCategory = async (categoryId: string) => {
    const nextName = categoryDrafts[categoryId]?.trim();
    if (!nextName) return;
    setIsBusy(true);
    setError(null);
    try {
      await client.request<{ category: ProductCategory }>(`/admin/categories/${categoryId}`, "PATCH", {
        name: nextName
      });
      await loadCategories(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const deleteCategory = async (categoryId: string) => {
    setIsBusy(true);
    setError(null);
    try {
      await client.request(`/admin/categories/${categoryId}`, "DELETE");
      await loadCategories(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const updateRule = async (
    rule: PricingRule,
    tiers: PricingTier[],
    allowedQuantitiesText: string,
    minCheckoutGramsText: string
  ) => {
    const constraints: Record<string, unknown> = {};
    const parsedAllowed = allowedQuantitiesText
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isFinite(entry) && entry > 0);
    const parsedMin = Number(minCheckoutGramsText);
    if (parsedAllowed.length > 0) constraints.allowed_quantities = parsedAllowed;
    if (Number.isFinite(parsedMin) && parsedMin > 0) constraints.min_checkout_grams = parsedMin;

    setIsBusy(true);
    setError(null);
    try {
      await client.request(`/admin/pricing-rules/${rule.id}`, "PATCH", { tiers, constraints });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsBusy(false);
    }
  };

  const updateOrderStatus = async (orderId: string, statusValue: OrderRecord["status"]) => {
    setUpdatingOrderIds((current) => [...current, orderId]);
    setIsBusy(true);
    setError(null);
    try {
      await client.request(`/admin/orders/${orderId}/status`, "PATCH", { status: statusValue });
      await reloadSessionData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUpdatingOrderIds((current) => current.filter((id) => id !== orderId));
      setIsBusy(false);
    }
  };

  const runOrdersReport = () => {
    if (!analyticsStartAt || !analyticsEndAt) {
      setError("Select a start and end time for the report.");
      return;
    }
    if (Number.isNaN(new Date(analyticsStartAt).getTime()) || Number.isNaN(new Date(analyticsEndAt).getTime())) {
      setError("Start and end times must be valid.");
      return;
    }
    if (analyticsOrders.length === 0) {
      setError("No orders found in the selected time range.");
      return;
    }

    setIsGeneratingReport(true);
    setError(null);
    try {
      exportOrdersReportPdf({
        orders: analyticsOrders,
        startAt: analyticsStartAt,
        endAt: analyticsEndAt,
        summary: analyticsSummary
      });
      setStatus(`Exported ${analyticsOrders.length} orders to PDF.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const resolveProductFromQuery = (query: string): Product | null => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return null;
    const byId = products.find((product) => product.id.toLowerCase() === normalized);
    if (byId) return byId;
    const byLabel = products.find(
      (product) => `${product.name} (${product.id})`.trim().toLowerCase() === normalized
    );
    if (byLabel) return byLabel;
    const byName = products.find((product) => product.name.trim().toLowerCase() === normalized);
    return byName ?? null;
  };

  const openOrderEditor = async (orderId: string) => {
    setOrderEditorLoading(true);
    setError(null);
    try {
      const detail = await client.request<{ order: OrderRecord; items: OrderDetailItem[] }>(`/admin/orders/${orderId}`);
      const order = detail.order;
      setEditingOrderId(order.id);
      setOrderEditor({
        customerName: order.customer_name ?? "",
        customerPhone: order.customer_phone ?? "",
        customerEmail: order.customer_email ?? "",
        deliveryAddress: order.delivery_address ?? "",
        deliveryInstructions: order.delivery_instructions ?? "",
        paymentMethod: order.payment_method ?? "cash",
        promoCode: getOrderPromoCode(order) ?? "",
        scheduledDeliveryTime: order.scheduled_delivery_time
          ? new Date(order.scheduled_delivery_time).toISOString().slice(0, 16)
          : "",
        status: order.status,
        customDiscount: Number(order.custom_discount ?? 0).toString(),
        note: ""
      });
      setOrderEditorItems(
        detail.items.map((item) => ({
          productId: item.product_id,
          productQuery: item.product_name_snapshot
            ? `${item.product_name_snapshot} (${item.product_id})`
            : item.product_id,
          quantity: String(Math.max(1, Math.round(Number(item.quantity))))
        }))
      );
      setIsOrderEditorOpen(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOrderEditorLoading(false);
    }
  };

  const addOrderEditorItem = () => {
    if (products.length === 0) return;
    setError(null);
    setNewOrderItemDraft({ productQuery: "", quantity: "1" });
    setIsAddItemMenuOpen(true);
  };

  const confirmAddOrderEditorItem = () => {
    const selectedProduct = resolveProductFromQuery(newOrderItemDraft.productQuery);
    if (!selectedProduct) {
      setError("Select a valid product from the list.");
      return;
    }
    const quantity = Math.max(1, Math.floor(Number(newOrderItemDraft.quantity) || 1));
    setOrderEditorItems((current) => [
      ...current,
      {
        productId: selectedProduct.id,
        productQuery: `${selectedProduct.name} (${selectedProduct.id})`,
        quantity: String(quantity)
      }
    ]);
    setIsAddItemMenuOpen(false);
    setNewOrderItemDraft({ productQuery: "", quantity: "1" });
  };

  const updateOrderEditorItem = (index: number, patch: Partial<OrderEditorItem>) => {
    setOrderEditorItems((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
  };

  const removeOrderEditorItem = (index: number) => {
    setOrderEditorItems((current) => current.filter((_, rowIndex) => rowIndex !== index));
  };

  const closeOrderEditor = () => {
    setIsOrderEditorOpen(false);
    setEditingOrderId(null);
    setOrderEditorItems([]);
    setIsAddItemMenuOpen(false);
    setNewOrderItemDraft({ productQuery: "", quantity: "1" });
    setOrderQuotePreview(null);
    setOrderEditor({
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      deliveryAddress: "",
      deliveryInstructions: "",
      paymentMethod: "cash",
      promoCode: "",
      scheduledDeliveryTime: "",
      status: "pending",
      customDiscount: "0",
      note: ""
    });
  };

  const saveEditedOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingOrderId) return;
    setIsBusy(true);
    setError(null);
    try {
      const payloadItems = orderEditorItems
        .map((item) => ({
          productId: item.productId,
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 0)),
          variationId: item.variationId || undefined
        }))
        .filter((item) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0);
      if (payloadItems.length === 0) {
        throw new Error("Add at least one valid order item.");
      }

      await client.request<{ order: OrderRecord }>(`/admin/orders/${editingOrderId}`, "PATCH", {
        customerName: orderEditor.customerName,
        customerPhone: orderEditor.customerPhone,
        customerEmail: orderEditor.customerEmail || null,
        deliveryAddress: orderEditor.deliveryAddress,
        deliveryInstructions: orderEditor.deliveryInstructions || null,
        paymentMethod: orderEditor.paymentMethod,
        promoCode: orderEditor.promoCode || undefined,
        scheduledDeliveryTime: orderEditor.scheduledDeliveryTime
          ? new Date(orderEditor.scheduledDeliveryTime).toISOString()
          : null,
        status: orderEditor.status,
        customDiscount: Number(orderEditor.customDiscount) || 0,
        note: orderEditor.note || undefined,
        items: payloadItems
      });

      await reloadSessionData();
      closeOrderEditor();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const saveMinimumOrder = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const nextValue = Number(minOrderAmountInput);
      const nextBufferValue = Number(minDeliveryBufferInput);
      const updated = await client.request<OrderSettings>("/admin/settings/order-minimum", "PATCH", {
        minOrderAmount: Number.isFinite(nextValue) && nextValue >= 0 ? nextValue : 0,
        minDeliveryBufferMinutes:
          Number.isFinite(nextBufferValue) && nextBufferValue >= 0 ? Math.floor(nextBufferValue) : 0
      });
      setSettings(updated);
      setMinOrderAmountInput(updated.minOrderAmount.toString());
      setMinDeliveryBufferInput(updated.minDeliveryBufferMinutes.toString());
      setStatus("Order settings updated");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const addNotificationEmail = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      await client.request<{ email: NotificationEmail }>("/admin/settings/notification-emails", "POST", {
        email: newNotificationEmail.email,
        name: newNotificationEmail.name || undefined,
        isActive: true,
        isPrimary: notificationEmails.length === 0
      });
      setNewNotificationEmail({ email: "", name: "" });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const toggleNotificationEmailActive = async (entry: NotificationEmail) => {
    setIsBusy(true);
    setError(null);
    try {
      await client.request<{ email: NotificationEmail }>(
        `/admin/settings/notification-emails/${entry.id}`,
        "PATCH",
        { isActive: !entry.is_active }
      );
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const setPrimaryNotificationEmail = async (entry: NotificationEmail) => {
    setIsBusy(true);
    setError(null);
    try {
      await client.request<{ email: NotificationEmail }>(
        `/admin/settings/notification-emails/${entry.id}`,
        "PATCH",
        { isPrimary: true, isActive: true }
      );
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const deleteNotificationEmail = async (entryId: string) => {
    setIsBusy(true);
    setError(null);
    try {
      await client.request(`/admin/settings/notification-emails/${entryId}`, "DELETE");
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBusy(false);
    }
  };

  const productRows = products.filter((product) => {
    if (productCategoryFilter !== "all" && product.category_slug !== productCategoryFilter) {
      return false;
    }
    const search = productSearch.trim().toLowerCase();
    if (!search) return true;
    return (
      product.id.toLowerCase().includes(search) ||
      product.name.toLowerCase().includes(search) ||
      product.short_description.toLowerCase().includes(search) ||
      product.long_description.toLowerCase().includes(search) ||
      product.category_name.toLowerCase().includes(search) ||
      product.category_slug.toLowerCase().includes(search) ||
      (product.pricing_group_name ?? "").toLowerCase().includes(search) ||
      (product.pricing_group_slug ?? "no_volume_discount").toLowerCase().includes(search) ||
      (product.variations ?? []).some((variation) => variation.name.toLowerCase().includes(search)) ||
      (product.tags ?? []).some((tag) => tag.toLowerCase().includes(search))
    );
  });

  const allProductTagSuggestions = useMemo(
    () => normalizeTagList(products.flatMap((product) => product.tags ?? [])).sort(),
    [products]
  );

  const promoRows = promos.filter((promo) => {
    const search = promoSearch.trim().toLowerCase();
    if (!search) return true;
    return (
      promo.code.toLowerCase().includes(search) ||
      promo.id.toLowerCase().includes(search) ||
      (promo.description ?? "").toLowerCase().includes(search)
    );
  });

  const dateFilteredOrders = orders.filter((order) => {
    if (orderDateFilter === "all") return true;
    const created = new Date(order.created_at);
    const createdDate = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime();
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (orderDateFilter === "today") {
      return createdDate === todayDate;
    }

    if (orderDateFilter === "yesterday") {
      const yesterdayDate = todayDate - 24 * 60 * 60 * 1000;
      return createdDate === yesterdayDate;
    }

    if (orderDateFilter === "last7") {
      const sevenDaysAgo = todayDate - 6 * 24 * 60 * 60 * 1000;
      return createdDate >= sevenDaysAgo && createdDate <= todayDate;
    }

    return true;
  });

  const orderRows = dateFilteredOrders.filter((order) => {
    const search = orderSearch.trim().toLowerCase();
    if (!search) return true;
    const promoCode = (getOrderPromoCode(order) ?? "").toLowerCase();
    const itemText = (order.pricing_snapshot?.items ?? [])
      .map((item) => `${item.product_name ?? ""} ${item.quantity ?? ""}`.trim())
      .join(" ")
      .toLowerCase();
    return (
      order.id.toLowerCase().includes(search) ||
      order.customer_name.toLowerCase().includes(search) ||
      order.delivery_address.toLowerCase().includes(search) ||
      STATUS_LABELS[order.status].toLowerCase().includes(search) ||
      promoCode.includes(search) ||
      itemText.includes(search)
    );
  });
  const filteredOrderRows =
    orderStatusFilter === "all"
      ? orderRows
      : orderRows.filter((order) => order.status === orderStatusFilter);
  const ordersByStatus = STATUS_OPTIONS.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    rows: filteredOrderRows.filter((order) => order.status === status)
  }));
  const pendingOrderCount = orders.filter((order) => order.status === "pending").length;
  const analyticsOrders = useMemo(
    () =>
      [...filterOrdersInRange(orders, analyticsStartAt, analyticsEndAt)].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [orders, analyticsStartAt, analyticsEndAt]
  );
  const analyticsSummary = useMemo(() => buildAnalyticsSummary(analyticsOrders), [analyticsOrders]);
  const analyticsChart = useMemo(
    () => buildChartAnalytics(analyticsOrders, analyticsStartAt, analyticsEndAt),
    [analyticsOrders, analyticsStartAt, analyticsEndAt]
  );
  const analyticsChartRows = analyticsChart.rows;
  const analyticsGranularity = analyticsChart.granularity;
  const analyticsGraphMax = useMemo(() => {
    if (analyticsChartRows.length === 0) return 1;
    if (analyticsGraphMetric === "orders") {
      return Math.max(1, ...analyticsChartRows.map((row) => row.orderCount));
    }
    return Math.max(1, ...analyticsChartRows.map((row) => row.revenue));
  }, [analyticsChartRows, analyticsGraphMetric]);
  const categoryByProductId = useMemo(
    () => new Map(products.map((product) => [product.id, product.category_slug])),
    [products]
  );
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  useEffect(() => {
    if (!isOrderEditorOpen) return;
    const normalizedItems = orderEditorItems
      .map((item) => ({
        productId: item.productId,
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 0)),
        variationId: item.variationId
      }))
      .filter((item) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0);
    if (normalizedItems.length === 0) {
      setOrderQuotePreview(null);
      return;
    }
    let cancelled = false;
    void client
      .request<{
        subtotal: number;
        total: number;
        savings: number;
        volumeDiscount: number;
        promoDiscount: number;
        items: Array<{ product_id: string; line_total: number; quantity: number }>;
      }>("/admin/pricing/quote", "POST", { items: normalizedItems, promoCode: orderEditor.promoCode || undefined })
      .then((quote) => {
        if (!cancelled) setOrderQuotePreview(quote);
      })
      .catch(() => {
        if (!cancelled) setOrderQuotePreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, isOrderEditorOpen, orderEditor.promoCode, orderEditorItems]);
  const orderEditorTotals = useMemo(() => {
    const fallbackSubtotal = orderEditorItems.reduce((sum, item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 0));
      const basePrice = Number(productById.get(item.productId)?.base_price ?? 0);
      if (!Number.isFinite(quantity) || !Number.isFinite(basePrice)) return sum;
      return sum + quantity * basePrice;
    }, 0);
    const subtotal = Number(orderQuotePreview?.subtotal ?? fallbackSubtotal);
    const quoteTotal = Number(orderQuotePreview?.total ?? fallbackSubtotal);
    const cogsTotal = orderEditorItems.reduce((sum, item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 0));
      const cogs = Number(productById.get(item.productId)?.cogs_per_unit ?? 0);
      if (!Number.isFinite(quantity) || !Number.isFinite(cogs)) return sum;
      return sum + quantity * cogs;
    }, 0);
    const customDiscount = Math.max(0, Number(orderEditor.customDiscount) || 0);
    const appliedDiscount = Math.min(customDiscount, quoteTotal);
    const total = quoteTotal - appliedDiscount;
    const grossProfit = total - cogsTotal;
    return {
      subtotal,
      cogsTotal,
      customDiscount: appliedDiscount,
      total,
      grossProfit,
      quoteTotal,
      hasRuleQuote: Boolean(orderQuotePreview)
    };
  }, [orderEditor.customDiscount, orderEditorItems, orderQuotePreview, productById]);
  const renderOrderItemsSummary = (order: OrderRecord): ReactNode => {
    const items = order.pricing_snapshot?.items ?? [];
    if (items.length === 0) {
      return <span className="order-item-pill-empty">No item detail</span>;
    }

    return (
      <div className="order-item-tags">
        {items.map((item, index) => {
          const categorySlug = item.product_id ? categoryByProductId.get(item.product_id) : undefined;
          return (
          <span
            className="order-item-pill"
            style={getCategoryTagStyle(categorySlug)}
            key={`${order.id}-${item.product_id ?? item.product_name ?? "item"}-${index}`}
          >
            {item.product_name ?? "Item"} x{item.quantity ?? 1}
          </span>
          );
        })}
      </div>
    );
  };

  const productGroups = [
    ...new Set([
      ...rules.map((rule) => rule.pricing_group_id),
      ...products.map((p) => p.pricing_group_slug).filter((slug): slug is string => Boolean(slug))
    ])
  ];

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((category) => category.slug === productDraft.categorySlug)) {
      setProductDraft((prev) => ({ ...prev, categorySlug: categories[0].slug }));
    }
  }, [categories, productDraft.categorySlug]);

  const refreshData = () => {
    void reloadSessionData();
  };

  if (!token || !adminRole) {
    return (
      <div className="auth-layout">
        <div className="auth-card">
          <p className="eyebrow">Top Cola</p>
          <h1>Admin Console</h1>
          <p className="status">Sign in with your admin password to manage products, rules, and orders.</p>
          <form onSubmit={login}>
            <div className="field">
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
              />
            </div>
            <div style={{ marginTop: 14 }}>
              <button type="submit" disabled={isBusy}>
                {isBusy ? "Signing in..." : "Sign In"}
              </button>
            </div>
          </form>
          <p className={`status ${error ? "error" : ""}`}>{error ?? status}</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="container">
        <header className="site-header">
          <div>
            <p className="eyebrow">Top Cola</p>
            <h2>Admin Console</h2>
          </div>
          <nav className="site-nav">
            {adminRole === "full" && (
              <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? "active-link" : ""}`}>
                Admin
              </NavLink>
            )}
            <NavLink to="/orders" className={({ isActive }) => `nav-link ${isActive ? "active-link" : ""}`}>
              {({ isActive }) => (
                <span className="orders-link-label">
                  Orders
                  {!isActive && pendingOrderCount > 0 && (
                    <span className="pending-alert-pill">{pendingOrderCount} Pending</span>
                  )}
                </span>
              )}
            </NavLink>
            {adminRole === "full" && (
              <NavLink to="/analytics" className={({ isActive }) => `nav-link ${isActive ? "active-link" : ""}`}>
                Analytics
              </NavLink>
            )}
          </nav>
          <div className="site-actions">
            <button onClick={refreshData} disabled={isBusy}>
              {isBusy ? "Syncing..." : "Refresh Data"}
            </button>
            <button className="secondary" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        <div className="dashboard-summary">
          <h2 className="dashboard-summary-title">Admin Dashboard</h2>
          <div className="dashboard-summary-stats">
            <div className="dashboard-stat dashboard-stat-orders">
              <strong>{metrics?.totalOrders ?? orders.length}</strong>
              <span>Total Orders</span>
            </div>
            <div className="dashboard-stat dashboard-stat-pending">
              <strong>{metrics?.pendingOrders ?? 0}</strong>
              <span>Pending</span>
            </div>
            {adminRole === "full" && (
              <>
                <div className="dashboard-stat dashboard-stat-products">
                  <strong>{products.filter((p) => p.active).length}</strong>
                  <span>Active Products</span>
                </div>
                <div className="dashboard-stat dashboard-stat-promos">
                  <strong>{promos.filter((promo) => promo.active).length}</strong>
                  <span>Active Promos</span>
                </div>
              </>
            )}
          </div>
        </div>

        <p className={`status ${error ? "error" : ""}`}>{error ?? status}</p>
        {lastSyncedAt && <p className="status">Last synced: {new Date(lastSyncedAt).toLocaleString()}</p>}

        <Routes>
          <Route
            path="/admin"
            element={
              adminRole === "full" ? (
              <div className="page-stack">
                <div className="tabs sub-tabs">
                  {ADMIN_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      className={adminTab === tab.id ? "active" : ""}
                      onClick={() => setAdminTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {adminTab === "products" && (
                  <div className="card product-management-card">
                  <div className="section-header">
                    <div>
                      <h3>Product Management</h3>
                      <p className="muted product-table-hint">
                        Double-click editable cells to update inline. Category, pricing group, status, and tags use
                        dropdown or typeahead on double-click.
                      </p>
                    </div>
                    <div className="section-actions">
                      <select
                        className="small-action-btn"
                        value={productCategoryFilter}
                        onChange={(event) => setProductCategoryFilter(event.target.value)}
                      >
                        <option value="all">All categories</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.slug}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="search-input"
                        placeholder="Search by product, category, or group"
                        value={productSearch}
                        onChange={(event) => setProductSearch(event.target.value)}
                      />
                      <button type="button" onClick={openCreateProductModal}>
                        Add Product
                      </button>
                    </div>
                  </div>
                  <div className="table-scroll-wrap product-table-scroll">
                  <table className="data-table product-table">
                    <thead>
                      <tr>
                        <th className="sticky-col-star product-col-static" aria-label="Starred" />
                        <th className="sticky-col-image product-col-static">Image</th>
                        <th className="sticky-col-product product-col-editable">Product</th>
                        <th className="product-col-static">ID</th>
                        <th className="product-col-editable">SKU</th>
                        <th className="product-col-editable">Short Description</th>
                        <th className="product-col-editable">Long Description</th>
                        <th className="product-col-editable">Base Price</th>
                        <th className="product-col-editable">COGS / Unit</th>
                        <th className="product-col-static">Avg Order Qty</th>
                        <th className="product-col-static">Avg Discount / Unit</th>
                        <th className="product-col-static">Avg Profit / Unit</th>
                        <th className="product-col-editable">Variations</th>
                        <th className="product-col-editable">Category ID</th>
                        <th className="product-col-editable">Pricing Group ID</th>
                        <th className="product-col-editable">Tags</th>
                        <th className="product-col-editable">Active</th>
                        <th className="product-col-static">Created At</th>
                        <th className="product-col-static">Updated At</th>
                        <th className="column-edit sticky-col-edit product-col-static" aria-label="Edit product" />
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map((p) => (
                        <ProductTableRow
                          key={p.id}
                          product={p}
                          categories={categories}
                          pricingGroups={productGroups}
                          tagSuggestions={allProductTagSuggestions}
                          inlineEdit={productInlineEdit}
                          savingCellKey={productInlineSaving}
                          onStartEdit={startProductInlineEdit}
                          onEditChange={(value) =>
                            setProductInlineEdit((current) => (current ? { ...current, value } : current))
                          }
                          onCommitEdit={() => void commitProductInlineEdit()}
                          onCancelEdit={cancelProductInlineEdit}
                          onSelectFieldChange={(column, value) =>
                            void handleProductSelectFieldChange(p, column, value)
                          }
                          onOpenEditModal={() => void openEditProductModal(p)}
                          onToggleStar={() => void toggleProductStar(p)}
                          isStarSaving={productStarSaving === p.id}
                        />
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
                )}

                {adminTab === "promos" && (
                  <div className="card promo-management-card">
                  <div className="section-header">
                    <div>
                      <h3>Promo Code Management</h3>
                      <p className="muted product-table-hint">
                        Double-click editable cells to update inline. Type and status open a dropdown on
                        double-click. Leave max discount or usage limit blank for no cap.
                      </p>
                    </div>
                    <div className="section-actions">
                      <input
                        className="search-input"
                        placeholder="Search promo code"
                        value={promoSearch}
                        onChange={(event) => setPromoSearch(event.target.value)}
                      />
                      <button type="button" onClick={() => setActiveAddModal("promo")}>
                        Add Promo Code
                      </button>
                    </div>
                  </div>
                  <div className="table-scroll-wrap product-table-scroll">
                  <table className="data-table product-table promo-table">
                    <thead>
                      <tr>
                        <th className="product-col-editable">Code</th>
                        <th className="product-col-static">ID</th>
                        <th className="product-col-editable">Description</th>
                        <th className="product-col-editable">Type</th>
                        <th className="product-col-editable">Value</th>
                        <th className="product-col-editable">Min Subtotal</th>
                        <th className="product-col-editable">Max Discount</th>
                        <th className="product-col-editable">Usage Limit</th>
                        <th className="product-col-static">Used</th>
                        <th className="product-col-editable">Status</th>
                        <th className="column-edit product-col-static" aria-label="Delete promo" />
                      </tr>
                    </thead>
                    <tbody>
                      {promoRows.map((promo) => (
                        <PromoTableRow
                          key={promo.id}
                          promo={promo}
                          inlineEdit={promoInlineEdit}
                          savingCellKey={promoInlineSaving}
                          onStartEdit={startPromoInlineEdit}
                          onEditChange={(value) =>
                            setPromoInlineEdit((current) => (current ? { ...current, value } : current))
                          }
                          onCommitEdit={() => void commitPromoInlineEdit()}
                          onCancelEdit={cancelPromoInlineEdit}
                          onSelectFieldChange={(column, value) =>
                            void handlePromoSelectFieldChange(promo, column, value)
                          }
                          onDelete={() => void deletePromo(promo)}
                          isBusy={isBusy}
                        />
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
                )}

                {adminTab === "rules" && (
                  <div className="card">
                  <div className="section-header">
                    <h3>Pricing Rules</h3>
                    <button type="button" className="small-action-btn" onClick={() => setActiveAddModal("rule")}>
                      Add Pricing Rule
                    </button>
                  </div>
                  <p className="status">Adjust tiers and constraints with form controls. Changes apply on save.</p>
                  {rules.map((rule) => (
                    <RuleEditor key={rule.id} rule={rule} onSave={updateRule} disabled={isBusy} />
                  ))}
                </div>
                )}

                {adminTab === "categories" && (
                  <div className="card">
                    <div className="section-header">
                      <h3>Product Categories</h3>
                      <button type="button" className="small-action-btn" onClick={() => setActiveAddModal("category")}>
                        Add Category
                      </button>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Slug</th>
                          <th>Name</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categories.map((category) => (
                          <tr key={category.id}>
                            <td>
                              <strong>{category.slug}</strong>
                            </td>
                            <td>
                              <input
                                value={categoryDrafts[category.id] ?? category.name}
                                onChange={(e) =>
                                  setCategoryDrafts((prev) => ({ ...prev, [category.id]: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <div className="actions">
                                <button type="button" className="secondary" onClick={() => void renameCategory(category.id)}>
                                  Save
                                </button>
                                <button type="button" className="danger secondary" onClick={() => void deleteCategory(category.id)}>
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {adminTab === "settings" && (
                  <div className="page-stack">
                    <div className="card">
                      <div className="section-header">
                        <h3>Order Settings</h3>
                      </div>
                      <div className="row">
                        <Field label="Minimum order amount ($)">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={minOrderAmountInput}
                            onChange={(event) => setMinOrderAmountInput(event.target.value)}
                          />
                        </Field>
                        <Field label="Minimum delivery buffer (minutes)">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={minDeliveryBufferInput}
                            onChange={(event) => setMinDeliveryBufferInput(event.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="actions">
                        <button type="button" onClick={() => void saveMinimumOrder()} disabled={isBusy}>
                          Save Minimum Order
                        </button>
                      </div>
                      <p className="status">
                        Current minimum: ${settings.minOrderAmount.toFixed(2)} | Delivery buffer:{" "}
                        {settings.minDeliveryBufferMinutes} min
                      </p>
                    </div>

                    <div className="card">
                      <div className="section-header">
                        <h3>Order Notification Emails</h3>
                      </div>
                      <form onSubmit={addNotificationEmail} className="row">
                        <Field label="Email">
                          <input
                            type="email"
                            required
                            value={newNotificationEmail.email}
                            onChange={(event) =>
                              setNewNotificationEmail((current) => ({ ...current, email: event.target.value }))
                            }
                            placeholder="ops@example.com"
                          />
                        </Field>
                        <Field label="Name (optional)">
                          <input
                            value={newNotificationEmail.name}
                            onChange={(event) =>
                              setNewNotificationEmail((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="Operations"
                          />
                        </Field>
                        <div className="actions" style={{ alignSelf: "end" }}>
                          <button type="submit" disabled={isBusy}>
                            Add Email
                          </button>
                        </div>
                      </form>

                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th>Email</th>
                            <th>Name</th>
                            <th>Active</th>
                            <th>Primary Sender</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {notificationEmails.map((entry) => (
                            <tr key={entry.id}>
                              <td>{entry.email}</td>
                              <td>{entry.name ?? "-"}</td>
                              <td>
                                <label className="toggle-inline">
                                  <input
                                    type="checkbox"
                                    checked={entry.is_active}
                                    onChange={() => void toggleNotificationEmailActive(entry)}
                                  />
                                  <span>{entry.is_active ? "On" : "Off"}</span>
                                </label>
                              </td>
                              <td>
                                <label className="toggle-inline">
                                  <input
                                    type="radio"
                                    name="primary-notification-email"
                                    checked={entry.is_primary}
                                    onChange={() => void setPrimaryNotificationEmail(entry)}
                                  />
                                  <span>{entry.is_primary ? "Primary" : "Set Primary"}</span>
                                </label>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="danger secondary small-action-btn"
                                  onClick={() => void deleteNotificationEmail(entry.id)}
                                  disabled={isBusy}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                          {notificationEmails.length === 0 && (
                            <tr>
                              <td colSpan={5} className="muted">
                                No notification emails configured yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              ) : (
                <Navigate to="/orders" replace />
              )
            }
          />
          <Route
            path="/orders"
            element={
              <div className="page-stack">
                <div className="card">
                  <h3>Overview Stats</h3>
                  <div className="metrics-grid">
                    {(Object.entries(metrics?.byStatus ?? {}) as [OrderRecord["status"], number][])
                      .filter(([statusName]) => statusName in STATUS_LABELS)
                      .map(([statusName, count]) => (
                      <div className="metric-chip" key={statusName}>
                        <span>{STATUS_LABELS[statusName]}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="section-header">
                    <h3>Order Queue</h3>
                    <div className="section-actions">
                      <select
                        className="small-action-btn"
                        value={orderDateFilter}
                        onChange={(event) => setOrderDateFilter(event.target.value as OrderDateFilter)}
                      >
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last7">Last 7 Days</option>
                        <option value="all">All Dates</option>
                      </select>
                      <select
                        className="small-action-btn"
                        value={orderStatusFilter}
                        onChange={(event) =>
                          setOrderStatusFilter(event.target.value as "all" | OrderRecord["status"])
                        }
                      >
                        <option value="all">All Statuses</option>
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                      <input
                        className="search-input"
                        placeholder="Search order, customer, or status"
                        value={orderSearch}
                        onChange={(event) => setOrderSearch(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="order-buckets">
                    {ordersByStatus.map((bucket) => (
                      <div
                        key={bucket.status}
                        className={`order-bucket ${bucket.status}-bucket ${bucket.status === "pending" && bucket.rows.length > 0 ? "pending-highlight" : ""}`}
                      >
                        <div className="bucket-header">
                          <h4>{bucket.label}</h4>
                          <span className="bucket-count">{bucket.rows.length}</span>
                        </div>
                        {bucket.rows.length === 0 ? (
                          <p className="muted">No orders in this status.</p>
                        ) : (
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Address</th>
                                <th>Items</th>
                                <th className="column-order-status">Status</th>
                                <th>Payment</th>
                                <th>Price</th>
                                <th>{adminRole === "orders" ? "Profit %" : "Profit"}</th>
                                <th>Scheduled</th>
                                <th>Order Placed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bucket.rows.map((order) => {
                                return (
                                <tr
                                  key={order.id}
                                  className={updatingOrderIds.includes(order.id) ? "order-updating-row" : ""}
                                  onClick={() => void openOrderEditor(order.id)}
                                >
                                  <td>
                                    <strong>{order.customer_name}</strong>
                                    <div className="muted">{order.customer_phone}</div>
                                  </td>
                                  <td>{order.delivery_address}</td>
                                  <td>{renderOrderItemsSummary(order)}</td>
                                  <td className="column-order-status">
                                    <select
                                      value={order.status}
                                      disabled={updatingOrderIds.includes(order.id)}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(e) =>
                                        void updateOrderStatus(order.id, e.target.value as OrderRecord["status"])
                                      }
                                    >
                                      {STATUS_OPTIONS.map((statusOption) => (
                                        <option key={statusOption} value={statusOption}>
                                          {STATUS_LABELS[statusOption]}
                                        </option>
                                      ))}
                                    </select>
                                    {updatingOrderIds.includes(order.id) && (
                                      <div className="buffer-indicator">
                                        <span className="buffer-dot" />
                                        <span className="buffer-dot" />
                                        <span className="buffer-dot" />
                                      </div>
                                    )}
                                  </td>
                                  <td>{order.payment_method === "zelle" ? "Zelle" : "Cash"}</td>
                                  <td>${Number(order.total).toFixed(2)}</td>
                                  <td>
                                    {formatOrderProfit(
                                      Number(order.gross_profit ?? 0),
                                      Number(order.total),
                                      adminRole
                                    )}
                                  </td>
                                  <td>{formatScheduledTime(order.scheduled_delivery_time)}</td>
                                  <td>{formatOrderPlacedTime(order.created_at)}</td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            }
          />
          <Route
            path="/analytics"
            element={
              adminRole === "full" ? (
              <div className="page-stack analytics-page">
                <div className="card analytics-controls-card">
                  <div className="section-header">
                    <div>
                      <h3>Order Analytics</h3>
                      <p className="muted product-table-hint">
                        Choose a date range, review daily performance, and export a PDF orders report.
                      </p>
                    </div>
                    <div className="section-actions analytics-range-actions">
                      <label className="analytics-datetime-field">
                        <span>Start</span>
                        <input
                          type="datetime-local"
                          value={analyticsStartAt}
                          onChange={(event) => setAnalyticsStartAt(event.target.value)}
                        />
                      </label>
                      <label className="analytics-datetime-field">
                        <span>End</span>
                        <input
                          type="datetime-local"
                          value={analyticsEndAt}
                          onChange={(event) => setAnalyticsEndAt(event.target.value)}
                        />
                      </label>
                      <button type="button" onClick={() => void runOrdersReport()} disabled={isGeneratingReport}>
                        {isGeneratingReport ? "Generating..." : "Run Orders Report"}
                      </button>
                    </div>
                  </div>
                  <div className="analytics-summary-grid">
                    <div className="analytics-summary-card">
                      <strong>{analyticsSummary.orderCount}</strong>
                      <span>Orders</span>
                    </div>
                    <div className="analytics-summary-card">
                      <strong>${analyticsSummary.revenue.toFixed(2)}</strong>
                      <span>Revenue</span>
                    </div>
                    <div className="analytics-summary-card">
                      <strong>${analyticsSummary.profit.toFixed(2)}</strong>
                      <span>Profit</span>
                    </div>
                    <div className="analytics-summary-card">
                      <strong>${analyticsSummary.averageOrderValue.toFixed(2)}</strong>
                      <span>Avg Order</span>
                    </div>
                    <div className="analytics-summary-card">
                      <strong>{analyticsSummary.completeCount}</strong>
                      <span>Complete</span>
                    </div>
                    <div className="analytics-summary-card">
                      <strong>{analyticsSummary.pendingCount}</strong>
                      <span>Pending</span>
                    </div>
                  </div>
                </div>

                <div className="card analytics-display-card">
                  <div className="section-header">
                    <div>
                      <h3>{getAnalyticsPeriodLabel(analyticsGranularity)}</h3>
                      <p className="muted product-table-hint">
                        {analyticsGranularity === "daily"
                          ? "Daily bars for ranges of 7 days or less."
                          : "Weekly bars for ranges longer than 7 days."}
                      </p>
                    </div>
                    <div className="section-actions analytics-view-actions">
                      {analyticsDisplayMode === "graph" && (
                        <select
                          className="small-action-btn"
                          value={analyticsGraphMetric}
                          onChange={(event) =>
                            setAnalyticsGraphMetric(event.target.value as "orders" | "revenue")
                          }
                        >
                          <option value="orders">Graph: Orders</option>
                          <option value="revenue">Graph: Revenue &amp; Profit</option>
                        </select>
                      )}
                      <div className="analytics-view-toggle">
                        <button
                          type="button"
                          className={analyticsDisplayMode === "table" ? "active" : "secondary"}
                          onClick={() => setAnalyticsDisplayMode("table")}
                        >
                          Table
                        </button>
                        <button
                          type="button"
                          className={analyticsDisplayMode === "graph" ? "active" : "secondary"}
                          onClick={() => setAnalyticsDisplayMode("graph")}
                        >
                          Graph
                        </button>
                      </div>
                    </div>
                  </div>

                  {analyticsChartRows.length === 0 ? (
                    <p className="muted">No orders in the selected time range.</p>
                  ) : analyticsDisplayMode === "table" ? (
                    <div className="table-scroll-wrap">
                      <table className="data-table analytics-table">
                        <thead>
                          <tr>
                            <th>{analyticsGranularity === "daily" ? "Date" : "Week"}</th>
                            <th>Orders</th>
                            <th>Revenue</th>
                            <th>Profit</th>
                            <th>Cancelled</th>
                            <th>Avg Order</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsChartRows.map((row) => (
                            <tr key={row.dateKey}>
                              <td>{row.label}</td>
                              <td>{row.orderCount}</td>
                              <td>${row.revenue.toFixed(2)}</td>
                              <td>${row.profit.toFixed(2)}</td>
                              <td>{row.cancelledCount}</td>
                              <td>
                                ${row.orderCount > 0 ? (row.revenue / row.orderCount).toFixed(2) : "0.00"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <>
                      {analyticsGraphMetric === "revenue" && (
                        <div className="analytics-chart-legend">
                          <span className="analytics-legend-item">
                            <i className="analytics-legend-swatch analytics-legend-swatch-cost" />
                            Costs
                          </span>
                          <span className="analytics-legend-item">
                            <i className="analytics-legend-swatch analytics-legend-swatch-profit" />
                            Profit
                          </span>
                        </div>
                      )}
                      <div className="analytics-chart">
                        {analyticsChartRows.map((row) => {
                          if (analyticsGraphMetric === "orders") {
                            const height = Math.max(8, Math.round((row.orderCount / analyticsGraphMax) * 100));
                            return (
                              <div className="analytics-chart-column" key={row.dateKey}>
                                <div className="analytics-chart-bar-wrap">
                                  <div
                                    className="analytics-chart-bar analytics-chart-bar-orders"
                                    style={{ height: `${height}%` }}
                                    title={`${row.orderCount} orders`}
                                  />
                                </div>
                                <span className="analytics-chart-value">{row.orderCount}</span>
                                <span className="analytics-chart-label">{row.label}</span>
                              </div>
                            );
                          }

                          const revenueHeight = Math.max(
                            8,
                            Math.round((row.revenue / analyticsGraphMax) * 100)
                          );
                          const profitAmount = Math.max(0, Math.min(row.profit, row.revenue));
                          const costAmount = Math.max(0, row.revenue - profitAmount);
                          const profitHeight =
                            row.revenue > 0
                              ? Math.max(0, Math.round((profitAmount / analyticsGraphMax) * 100))
                              : 0;
                          const costHeight = Math.max(0, revenueHeight - profitHeight);

                          return (
                            <div className="analytics-chart-column" key={row.dateKey}>
                              <div className="analytics-chart-bar-wrap">
                                <div
                                  className="analytics-chart-stack"
                                  style={{ height: `${revenueHeight}%` }}
                                  title={`Revenue $${row.revenue.toFixed(2)} · Profit $${profitAmount.toFixed(2)} · Costs $${costAmount.toFixed(2)}`}
                                >
                                  {profitHeight > 0 && (
                                    <div
                                      className="analytics-chart-bar analytics-chart-bar-profit"
                                      style={{ height: `${(profitHeight / revenueHeight) * 100}%` }}
                                    />
                                  )}
                                  {costHeight > 0 && (
                                    <div
                                      className="analytics-chart-bar analytics-chart-bar-cost"
                                      style={{ height: `${(costHeight / revenueHeight) * 100}%` }}
                                    />
                                  )}
                                </div>
                              </div>
                              <span className="analytics-chart-value">${row.revenue.toFixed(0)}</span>
                              <span className="analytics-chart-subvalue">${profitAmount.toFixed(0)} profit</span>
                              <span className="analytics-chart-label">{row.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
              ) : (
                <Navigate to="/orders" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>

        <Modal
          open={activeAddModal === "product"}
          title={editingProductId ? "Edit Product" : "Add Product"}
          size="wide"
          onClose={closeProductModal}
        >
          <form onSubmit={saveProduct} className="product-modal-form">
            <Field label="SKU (optional)" className="product-modal-half-width">
              <input value={productDraft.sku} onChange={(e) => setProductDraft((p) => ({ ...p, sku: e.target.value }))} />
            </Field>
            <Field label="Product name" className="product-modal-half-width">
              <input required value={productDraft.name} onChange={(e) => setProductDraft((p) => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Price" className="product-modal-half-width">
              <div className="variation-editor">
                <div className="row">
                  <label className="toggle-inline">
                    <input
                      type="checkbox"
                      checked={productDraft.basePriceMethod === "unit"}
                      onChange={() =>
                        setProductDraft((p) => ({
                          ...p,
                          basePrice: convertDraftValueBetweenModes(p.basePrice, p.basePriceMethod, "unit"),
                          basePriceMethod: "unit"
                        }))
                      }
                    />
                    <span>Unit Price</span>
                  </label>
                  <label className="toggle-inline">
                    <input
                      type="checkbox"
                      checked={productDraft.basePriceMethod === "weighted"}
                      onChange={() =>
                        setProductDraft((p) => ({
                          ...p,
                          basePrice: convertDraftValueBetweenModes(p.basePrice, p.basePriceMethod, "weighted"),
                          basePriceMethod: "weighted"
                        }))
                      }
                    />
                    <span>Weighted Price ($ / 454 units)</span>
                  </label>
                </div>
                <input
                  type="number"
                  step={productDraft.basePriceMethod === "weighted" ? "1" : "0.001"}
                  min="0"
                  value={productDraft.basePrice}
                  onChange={(e) => setProductDraft((p) => ({ ...p, basePrice: e.target.value }))}
                  placeholder={
                    productDraft.basePriceMethod === "weighted"
                      ? "Enter $ per 454g"
                      : "Enter unit price"
                  }
                />
                <span className="muted">
                  Stored unit price: $
                  {roundUnitPrice(
                    (Number(productDraft.basePrice) || 0) /
                      (productDraft.basePriceMethod === "weighted" ? 454 : 1)
                  ).toFixed(3)}
                </span>
              </div>
            </Field>
            <Field label="COGS" className="product-modal-half-width">
              <div className="variation-editor">
                <div className="row">
                  <label className="toggle-inline">
                    <input
                      type="checkbox"
                      checked={productDraft.cogsPriceMethod === "unit"}
                      onChange={() =>
                        setProductDraft((p) => ({
                          ...p,
                          cogsPrice: convertDraftValueBetweenModes(p.cogsPrice, p.cogsPriceMethod, "unit"),
                          cogsPriceMethod: "unit"
                        }))
                      }
                    />
                    <span>Unit COGS</span>
                  </label>
                  <label className="toggle-inline">
                    <input
                      type="checkbox"
                      checked={productDraft.cogsPriceMethod === "weighted"}
                      onChange={() =>
                        setProductDraft((p) => ({
                          ...p,
                          cogsPrice: convertDraftValueBetweenModes(p.cogsPrice, p.cogsPriceMethod, "weighted"),
                          cogsPriceMethod: "weighted"
                        }))
                      }
                    />
                    <span>Weighted COGS ($ / 454 units)</span>
                  </label>
                </div>
                <input
                  type="number"
                  step={productDraft.cogsPriceMethod === "weighted" ? "1" : "0.001"}
                  min="0"
                  value={productDraft.cogsPrice}
                  onChange={(e) => setProductDraft((p) => ({ ...p, cogsPrice: e.target.value }))}
                  placeholder={
                    productDraft.cogsPriceMethod === "weighted"
                      ? "Enter COGS per 454 units"
                      : "Enter unit COGS"
                  }
                />
                <span className="muted">
                  Stored unit COGS: $
                  {roundUnitPrice(
                    (Number(productDraft.cogsPrice) || 0) /
                      (productDraft.cogsPriceMethod === "weighted" ? 454 : 1)
                  ).toFixed(3)}
                </span>
              </div>
            </Field>
            <Field label="Category" className="product-modal-half-width">
              <select value={productDraft.categorySlug} onChange={(e) => setProductDraft((p) => ({ ...p, categorySlug: e.target.value }))}>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name} ({category.slug})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pricing group" className="product-modal-half-width">
              <select
                value={productDraft.pricingGroupSlug}
                onChange={(e) => setProductDraft((p) => ({ ...p, pricingGroupSlug: e.target.value }))}
              >
                <option value="">No volume discount</option>
                {productGroups.map((groupId) => (
                  <option key={groupId} value={groupId}>
                    {groupId}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Short description" className="product-modal-full-width">
              <textarea
                value={productDraft.shortDescription}
                onChange={(e) => setProductDraft((p) => ({ ...p, shortDescription: e.target.value }))}
                placeholder="Brief summary for product cards and listings"
              />
            </Field>
            <Field label="Long description" className="product-modal-full-width">
              <textarea
                value={productDraft.longDescription}
                onChange={(e) => setProductDraft((p) => ({ ...p, longDescription: e.target.value }))}
                placeholder="Full product details"
              />
            </Field>
            <Field label="Variations (optional)" className="product-modal-full-width">
              <div className="variation-editor">
                <div className="variation-tags">
                  {productVariationsDraft.length > 0 ? (
                    productVariationsDraft.map((variation) => (
                      <span key={variation.id} className="variation-tag">
                        {variation.name}
                        <button
                          type="button"
                          className="variation-tag-remove"
                          onClick={() => removeVariationTag(variation.id)}
                          aria-label={`Remove ${variation.name}`}
                        >
                          x
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="variation-tag-empty">No variations added yet</span>
                  )}
                </div>
                <div className="variation-entry-row">
                  <input
                    placeholder="Type variation name"
                    value={variationInputValue}
                    onChange={(e) => setVariationInputValue(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addVariationTag();
                      }
                    }}
                  />
                  <button type="button" className="small-action-btn" onClick={addVariationTag}>
                    Add
                  </button>
                </div>
              </div>
            </Field>
            <Field label="Tags (optional)" className="product-modal-full-width">
              <TagTypeaheadEditor
                tags={productTagsDraft}
                suggestions={allProductTagSuggestions}
                onChange={setProductTagsDraft}
                placeholder="Type to search or add a tag"
              />
            </Field>
            <Field label="Product Images" className="product-modal-full-width">
              <div className="image-manager">
                <div
                  className={`image-dropzone ${isDragOverImageZone ? "drag-over" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragOverImageZone(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsDragOverImageZone(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragOverImageZone(false);
                    handleProductImageFiles(Array.from(event.dataTransfer.files));
                  }}
                >
                  <p>Drag and drop images here</p>
                  <label className="dropzone-button">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(event) => {
                        handleProductImageFiles(Array.from(event.target.files ?? []));
                        event.currentTarget.value = "";
                      }}
                    />
                    {isUploadingImages ? "Uploading..." : "Upload Images"}
                  </label>
                </div>

                <div className="image-section">
                  <h4>Primary Image</h4>
                  {editingProductId ? (
                    productImages.find((image) => image.is_primary) ? (
                      <img
                        className="primary-image-preview"
                        src={productImages.find((image) => image.is_primary)?.image_url}
                        alt="Primary product"
                      />
                    ) : (
                      <p className="muted">No primary image selected yet.</p>
                    )
                  ) : pendingProductImages.find((image) => image.isPrimary) ? (
                    <img
                      className="primary-image-preview"
                      src={pendingProductImages.find((image) => image.isPrimary)?.previewUrl}
                      alt="Primary product preview"
                    />
                  ) : (
                    <p className="muted">No primary image selected yet.</p>
                  )}
                </div>

                <div className="image-section">
                  <h4>Gallery Images</h4>
                  {editingProductId ? (
                    productImages.length === 0 ? (
                      <p className="muted">No gallery images yet.</p>
                    ) : (
                      <div className="gallery-grid">
                        {productImages.map((image) => (
                          <div key={image.id} className="gallery-item">
                            <img src={image.image_url} alt="Product gallery" />
                            <div className="gallery-item-actions">
                              <button
                                type="button"
                                className="small-action-btn secondary"
                                disabled={isBusy || image.is_primary}
                                onClick={() => void markImageAsPrimary(image.id)}
                              >
                                {image.is_primary ? "Primary" : "Set Primary"}
                              </button>
                              <button
                                type="button"
                                className="small-action-btn danger secondary"
                                disabled={isBusy}
                                onClick={() => void deleteProductImage(image.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : pendingProductImages.length === 0 ? (
                    <p className="muted">No gallery images yet.</p>
                  ) : (
                    <div className="gallery-grid">
                      {pendingProductImages.map((image) => (
                        <div key={image.id} className="gallery-item">
                          <img src={image.previewUrl} alt="Product gallery preview" />
                          <div className="gallery-item-actions">
                            <button
                              type="button"
                              className="small-action-btn secondary"
                              disabled={image.isPrimary}
                              onClick={() => setPendingImageAsPrimary(image.id)}
                            >
                              {image.isPrimary ? "Primary" : "Set Primary"}
                            </button>
                            <button
                              type="button"
                              className="small-action-btn danger secondary"
                              disabled={isBusy}
                              onClick={() => removePendingProductImage(image.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Field>
            <div style={{ marginTop: 10 }} className="actions product-modal-full-width product-modal-actions">
              {editingProductId ? (
                <button type="button" className="danger secondary" disabled={isBusy} onClick={() => void deleteProduct()}>
                  Delete Product
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
              <button type="submit" disabled={isBusy}>
                {editingProductId ? "Save Product" : "Add Product"}
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          open={activeAddModal === "promo"}
          title="Add Promo Code"
          onClose={() => setActiveAddModal(null)}
        >
          <form onSubmit={createPromo}>
            <Field label="Promo code">
              <input required value={newPromo.code} onChange={(e) => setNewPromo((p) => ({ ...p, code: e.target.value }))} />
            </Field>
            <Field label="Discount type">
              <select value={newPromo.discountType} onChange={(e) => setNewPromo((p) => ({ ...p, discountType: e.target.value as "percent" | "fixed" }))}>
                <option value="percent">percent</option>
                <option value="fixed">fixed</option>
              </select>
            </Field>
            <Field label="Discount value">
              <input type="number" step="0.01" value={newPromo.discountValue} onChange={(e) => setNewPromo((p) => ({ ...p, discountValue: e.target.value }))} />
            </Field>
            <Field label="Minimum subtotal">
              <input type="number" step="0.01" value={newPromo.minSubtotal} onChange={(e) => setNewPromo((p) => ({ ...p, minSubtotal: e.target.value }))} />
            </Field>
            <Field label="Description">
              <textarea value={newPromo.description} onChange={(e) => setNewPromo((p) => ({ ...p, description: e.target.value }))} />
            </Field>
            <div style={{ marginTop: 10 }} className="actions">
              <button type="submit" disabled={isBusy}>Add Promo</button>
            </div>
          </form>
        </Modal>

        <Modal
          open={activeAddModal === "rule"}
          title="Add Pricing Rule"
          onClose={() => setActiveAddModal(null)}
        >
          <form onSubmit={createRule}>
            <Field label="Rule slug">
              <input required value={newRule.slug} onChange={(e) => setNewRule((prev) => ({ ...prev, slug: e.target.value }))} />
            </Field>
            <Field label="Rule name">
              <input required value={newRule.name} onChange={(e) => setNewRule((prev) => ({ ...prev, name: e.target.value }))} />
            </Field>
            <Field label="Pricing group">
              <select value={newRule.pricingGroupId} onChange={(e) => setNewRule((prev) => ({ ...prev, pricingGroupId: e.target.value }))}>
                <option value="">Select group</option>
                {productGroups.map((groupId) => (
                  <option key={groupId} value={groupId}>{groupId}</option>
                ))}
              </select>
            </Field>
            <Field label="Metric">
              <select value={newRule.metric} onChange={(e) => setNewRule((prev) => ({ ...prev, metric: e.target.value as "units" | "grams" }))}>
                <option value="units">units</option>
                <option value="grams">grams</option>
              </select>
            </Field>
            <Field label="First tier min">
              <input type="number" value={newRule.firstTierMin} onChange={(e) => setNewRule((prev) => ({ ...prev, firstTierMin: e.target.value }))} />
            </Field>
            <Field label="First tier adjustment type">
              <select value={newRule.firstTierType} onChange={(e) => setNewRule((prev) => ({ ...prev, firstTierType: e.target.value as PricingTier["adjustment_type"] }))}>
                <option value="none">No discount</option>
                <option value="percent">Percent (%)</option>
                <option value="fixed_per_unit">Fixed per unit ($)</option>
              </select>
            </Field>
            <Field label="First tier adjustment value">
              <input type="number" step="0.01" value={newRule.firstTierValue} onChange={(e) => setNewRule((prev) => ({ ...prev, firstTierValue: e.target.value }))} />
            </Field>
            <div style={{ marginTop: 10 }} className="actions">
              <button type="submit" disabled={isBusy || !newRule.pricingGroupId}>Add Pricing Rule</button>
            </div>
          </form>
        </Modal>

        <Modal
          open={activeAddModal === "category"}
          title="Add Category"
          onClose={() => setActiveAddModal(null)}
        >
          <form onSubmit={createCategory}>
            <Field label="Slug">
              <input
                required
                value={newCategory.slug}
                placeholder="e.g. concentrates"
                onChange={(e) => setNewCategory((prev) => ({ ...prev, slug: e.target.value }))}
              />
            </Field>
            <Field label="Display name">
              <input
                required
                value={newCategory.name}
                placeholder="e.g. Concentrates"
                onChange={(e) => setNewCategory((prev) => ({ ...prev, name: e.target.value }))}
              />
            </Field>
            <div style={{ marginTop: 10 }} className="actions">
              <button type="submit" disabled={isBusy}>Add Category</button>
            </div>
          </form>
        </Modal>

        <Modal
          open={isOrderEditorOpen}
          title={editingOrderId ? `Edit Order ${editingOrderId}` : "Edit Order"}
          size="fullscreen"
          onClose={closeOrderEditor}
        >
          {orderEditorLoading ? (
            <p className="status">Loading order details...</p>
          ) : (
            <form onSubmit={saveEditedOrder} className="order-editor-form">
              <div className="order-editor-grid">
                <Field label="Customer Name">
                  <input
                    value={orderEditor.customerName}
                    onChange={(event) => setOrderEditor((current) => ({ ...current, customerName: event.target.value }))}
                  />
                </Field>
                <Field label="Customer Phone">
                  <input
                    value={orderEditor.customerPhone}
                    onChange={(event) => setOrderEditor((current) => ({ ...current, customerPhone: event.target.value }))}
                  />
                </Field>
                <Field label="Customer Email">
                  <input
                    value={orderEditor.customerEmail}
                    onChange={(event) => setOrderEditor((current) => ({ ...current, customerEmail: event.target.value }))}
                  />
                </Field>
                <Field label="Payment Method">
                  <select
                    value={orderEditor.paymentMethod}
                    onChange={(event) =>
                      setOrderEditor((current) => ({
                        ...current,
                        paymentMethod: event.target.value as "cash" | "zelle"
                      }))
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="zelle">Zelle</option>
                  </select>
                </Field>
                <Field label="Promo Code">
                  <input value={orderEditor.promoCode} readOnly placeholder="No promo applied" />
                </Field>
                <Field label="Scheduled Delivery">
                  <input
                    type="datetime-local"
                    value={orderEditor.scheduledDeliveryTime}
                    onChange={(event) =>
                      setOrderEditor((current) => ({ ...current, scheduledDeliveryTime: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Order Status">
                  <select
                    value={orderEditor.status}
                    onChange={(event) =>
                      setOrderEditor((current) => ({
                        ...current,
                        status: event.target.value as OrderRecord["status"]
                      }))
                    }
                  >
                    {STATUS_OPTIONS.map((statusOption) => (
                      <option key={statusOption} value={statusOption}>
                        {STATUS_LABELS[statusOption]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Delivery Address">
                  <input
                    value={orderEditor.deliveryAddress}
                    onChange={(event) =>
                      setOrderEditor((current) => ({ ...current, deliveryAddress: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Delivery Instructions">
                  <input
                    value={orderEditor.deliveryInstructions}
                    onChange={(event) =>
                      setOrderEditor((current) => ({ ...current, deliveryInstructions: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Edit Note (optional)">
                  <input
                    value={orderEditor.note}
                    onChange={(event) => setOrderEditor((current) => ({ ...current, note: event.target.value }))}
                  />
                </Field>
              </div>

              <div className="order-editor-items card">
                <div className="section-header">
                  <h4>Products</h4>
                  <button type="button" className="small-action-btn" onClick={addOrderEditorItem}>
                    Add Item
                  </button>
                </div>
                {isAddItemMenuOpen && (
                  <div className="row" style={{ marginBottom: 12 }}>
                    <Field label="Product">
                      <input
                        list="order-products-list"
                        value={newOrderItemDraft.productQuery}
                        placeholder="Search product name"
                        onChange={(event) =>
                          setNewOrderItemDraft((current) => ({ ...current, productQuery: event.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Quantity">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={newOrderItemDraft.quantity}
                        onChange={(event) =>
                          setNewOrderItemDraft((current) => ({ ...current, quantity: event.target.value }))
                        }
                      />
                    </Field>
                    <div className="actions" style={{ alignSelf: "end" }}>
                      <button type="button" className="secondary" onClick={() => setIsAddItemMenuOpen(false)}>
                        Cancel
                      </button>
                      <button type="button" onClick={confirmAddOrderEditorItem}>
                        Add
                      </button>
                    </div>
                  </div>
                )}
                <datalist id="order-products-list">
                  {products.map((product) => (
                    <option key={product.id} value={`${product.name} (${product.id})`} />
                  ))}
                </datalist>
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Rule Price</th>
                      <th>Line Total</th>
                      <th>{adminRole === "orders" ? "Profit %" : "Profit"}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {orderEditorItems.map((item, index) => {
                      const quantity = Number(item.quantity) || 0;
                      const basePrice = Number(productById.get(item.productId)?.base_price ?? 0);
                      const quoteLine = orderQuotePreview?.items?.[index];
                      const lineTotal =
                        quoteLine?.product_id === item.productId ? quoteLine.line_total : basePrice * quantity;
                      const lineCogs =
                        Number(productById.get(item.productId)?.cogs_per_unit ?? 0) * Math.max(0, quantity);
                      const discountShare =
                        orderEditorTotals.quoteTotal > 0
                          ? (lineTotal / orderEditorTotals.quoteTotal) * orderEditorTotals.customDiscount
                          : 0;
                      const lineProfit = lineTotal - discountShare - lineCogs;
                      return (
                        <tr key={`order-item-${index}`}>
                          <td>
                            <input
                              list="order-products-list"
                              value={item.productQuery}
                              placeholder="Search product name"
                              onChange={(event) => {
                                const productQuery = event.target.value;
                                const matched = resolveProductFromQuery(productQuery);
                                updateOrderEditorItem(index, {
                                  productQuery,
                                  ...(matched ? { productId: matched.id } : {})
                                });
                              }}
                            />
                            <div className="muted">{item.productId || "No product selected"}</div>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity}
                              onChange={(event) => {
                                const raw = event.target.value;
                                if (raw === "") {
                                  updateOrderEditorItem(index, { quantity: "" });
                                  return;
                                }
                                const normalized = String(Math.max(1, Math.floor(Number(raw) || 1)));
                                updateOrderEditorItem(index, { quantity: normalized });
                              }}
                            />
                          </td>
                          <td>${basePrice.toFixed(2)}</td>
                          <td>${lineTotal.toFixed(2)}</td>
                          <td>
                            {formatOrderProfit(lineProfit, orderEditorTotals.total, adminRole ?? "orders")}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="small-action-btn danger secondary"
                              onClick={() => removeOrderEditorItem(index)}
                              disabled={orderEditorItems.length <= 1}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="order-editor-discount card">
                <h4>Custom Discount</h4>
                <p className="muted">Apply a blanket discount after standard pricing rules.</p>
                <Field label="Custom Discount ($)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={orderEditor.customDiscount}
                    onChange={(event) =>
                      setOrderEditor((current) => ({ ...current, customDiscount: event.target.value }))
                    }
                  />
                </Field>
              </div>

              <div className="order-editor-summary card">
                <h4>Totals</h4>
                {!orderEditorTotals.hasRuleQuote && (
                  <p className="status">Using base price fallback while rule quote is loading.</p>
                )}
                <div className="order-editor-summary-grid">
                  <span>Applied Promo</span>
                  <strong>{orderEditor.promoCode || "None"}</strong>
                  <span>Subtotal</span>
                  <strong>${orderEditorTotals.subtotal.toFixed(2)}</strong>
                  <span>Volume Discount</span>
                  <strong>-${Number(orderQuotePreview?.volumeDiscount ?? 0).toFixed(2)}</strong>
                  <span>Promo Discount</span>
                  <strong>-${Number(orderQuotePreview?.promoDiscount ?? 0).toFixed(2)}</strong>
                  <span>Rule Total (after standard discounts)</span>
                  <strong>${orderEditorTotals.quoteTotal.toFixed(2)}</strong>
                  <span>Custom Discount</span>
                  <strong>-${orderEditorTotals.customDiscount.toFixed(2)}</strong>
                  <span>Total</span>
                  <strong>${orderEditorTotals.total.toFixed(2)}</strong>
                  <span>{adminRole === "orders" ? "Estimated Profit %" : "Estimated Profit"}</span>
                  <strong>
                    {formatOrderProfit(orderEditorTotals.grossProfit, orderEditorTotals.total, adminRole ?? "orders")}
                  </strong>
                </div>
              </div>

              <div className="actions">
                <button type="button" className="secondary" onClick={closeOrderEditor}>
                  Cancel
                </button>
                <button type="submit" disabled={isBusy}>
                  Save Order Changes
                </button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </BrowserRouter>
  );
}

function RuleEditor({
  rule,
  onSave,
  disabled
}: {
  rule: PricingRule;
  onSave: (
    rule: PricingRule,
    tiers: PricingTier[],
    allowedQuantitiesText: string,
    minCheckoutGramsText: string
  ) => Promise<void>;
  disabled: boolean;
}) {
  const [tiers, setTiers] = useState<PricingTier[]>([...rule.tiers].sort((a, b) => a.min - b.min));
  const [allowedQuantitiesText, setAllowedQuantitiesText] = useState(
    (rule.constraints.allowed_quantities ?? []).join(", ")
  );
  const [minCheckoutGramsText, setMinCheckoutGramsText] = useState(
    rule.constraints.min_checkout_grams?.toString() ?? ""
  );
  const [message, setMessage] = useState<string | null>(null);

  const updateTier = (index: number, patch: Partial<PricingTier>) => {
    setTiers((current) => current.map((tier, tierIndex) => (tierIndex === index ? { ...tier, ...patch } : tier)));
  };

  const removeTier = (index: number) => {
    setTiers((current) => current.filter((_, tierIndex) => tierIndex !== index));
  };

  return (
    <div className="card rule-card">
      <h4>{rule.name}</h4>
      <div className="rule-meta">
        <span className="meta-pill meta-pill-slug">Slug: {rule.slug}</span>
        <span className="meta-pill meta-pill-group">Group: {rule.pricing_group_id}</span>
        <span className="meta-pill meta-pill-metric">Metric: {rule.metric}</span>
      </div>

      <div className="rule-table-wrap">
        <table className="data-table compact">
          <thead>
            <tr>
              <th>Min Qty</th>
              <th>Adjustment Type</th>
              <th>Adjustment Value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, index) => (
              <tr key={`${rule.id}-${index}`}>
                <td>
                  <input
                    type="number"
                    value={tier.min}
                    onChange={(event) => updateTier(index, { min: Number(event.target.value) })}
                  />
                </td>
                <td>
                  <select
                    value={tier.adjustment_type}
                    onChange={(event) =>
                      updateTier(index, {
                        adjustment_type: event.target.value as PricingTier["adjustment_type"]
                      })
                    }
                  >
                    <option value="none">No discount</option>
                    <option value="percent">Percent (%)</option>
                    <option value="fixed_per_unit">Fixed per unit ($)</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={tier.adjustment_value}
                    onChange={(event) =>
                      updateTier(index, { adjustment_value: Number(event.target.value) })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="danger secondary"
                    onClick={() => removeTier(index)}
                    disabled={tiers.length <= 1}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row">
        <Field label="Allowed quantities (comma separated)">
          <input
            value={allowedQuantitiesText}
            onChange={(event) => setAllowedQuantitiesText(event.target.value)}
            placeholder="1, 4, 8, 16"
          />
        </Field>
        <Field label="Minimum checkout grams (optional)">
          <input
            type="number"
            step="0.01"
            value={minCheckoutGramsText}
            onChange={(event) => setMinCheckoutGramsText(event.target.value)}
            placeholder="16"
          />
        </Field>
      </div>

      <div className="actions">
        <button
          type="button"
          className="secondary"
          onClick={() =>
            setTiers((current) => [
              ...current,
              {
                min: current[current.length - 1]?.min ?? 1,
                adjustment_type: "none",
                adjustment_value: 0
              }
            ])
          }
        >
          Add Tier
        </button>
        <button
          disabled={disabled}
          onClick={async (event) => {
            event.preventDefault();
            try {
              const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);
              await onSave(rule, sortedTiers, allowedQuantitiesText, minCheckoutGramsText);
              setMessage("Saved");
            } catch (error) {
              setMessage((error as Error).message);
            }
          }}
        >
          Save Rule
        </button>
      </div>
      {message && <p className="status">{message}</p>}
    </div>
  );
}

function TagTypeaheadEditor({
  tags,
  suggestions,
  onChange,
  onCommit,
  onCancel,
  disabled = false,
  compact = false,
  placeholder = "Type to search tags..."
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSuggestions = suggestions.filter(
    (suggestion) => !tags.includes(suggestion) && suggestion.includes(normalizedQuery)
  );
  const canCreateTag =
    normalizedQuery.length > 0 && !tags.includes(normalizedQuery) && !suggestions.includes(normalizedQuery);
  const options = [
    ...filteredSuggestions.map((value) => ({ type: "existing" as const, value })),
    ...(canCreateTag ? [{ type: "create" as const, value: normalizedQuery }] : [])
  ];

  useEffect(() => {
    if (!open) return;
    setHighlightIndex(0);
  }, [normalizedQuery, open]);

  useEffect(() => {
    if (!onCommit) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onCommit();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onCommit]);

  const addTag = (rawTag: string) => {
    const nextTag = rawTag.trim().toLowerCase();
    if (!nextTag) return;
    onChange(normalizeTagList([...tags, nextTag]));
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
    inputRef.current?.focus();
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    addTag(option.value);
  };

  return (
    <div
      ref={rootRef}
      className={`tag-typeahead${compact ? " tag-typeahead-compact" : ""}${disabled ? " tag-typeahead-disabled" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="tag-typeahead-tags">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <span key={tag} className="variation-tag">
              {tag}
              <button
                type="button"
                className="variation-tag-remove"
                disabled={disabled}
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
              >
                x
              </button>
            </span>
          ))
        ) : (
          <span className="variation-tag-empty">No tags added yet</span>
        )}
      </div>
      <div className="tag-typeahead-input-wrap">
        <input
          ref={inputRef}
          type="text"
          className="tag-typeahead-input"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!open) setOpen(true);
              setHighlightIndex((current) => Math.min(current + 1, Math.max(options.length - 1, 0)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightIndex((current) => Math.max(current - 1, 0));
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (open && options.length > 0) {
                selectOption(highlightIndex);
                return;
              }
              if (normalizedQuery) addTag(normalizedQuery);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setQuery("");
              onCancel?.();
              return;
            }
            if (event.key === "Backspace" && !query && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
        />
        {open && options.length > 0 && (
          <ul className="tag-typeahead-menu" role="listbox">
            {options.map((option, index) => (
              <li key={`${option.type}-${option.value}`}>
                <button
                  type="button"
                  className={`tag-typeahead-option${index === highlightIndex ? " is-active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(index)}
                >
                  {option.type === "create" ? `Create "${option.value}"` : option.value}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProductTagsInlineCell({
  className,
  productTags,
  tagSuggestions,
  editValue,
  isEditing,
  isSaving,
  onStartEdit,
  onTagsChange,
  onCommit,
  onCancel
}: {
  className?: string;
  productTags: string[];
  tagSuggestions: string[];
  editValue: string;
  isEditing: boolean;
  isSaving: boolean;
  onStartEdit: () => void;
  onTagsChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const cellClassName = [
    className,
    "product-cell-editable",
    "column-tags",
    isEditing ? "product-cell-editing product-cell-tags" : "",
    isSaving ? "product-cell-saving" : ""
  ]
    .filter(Boolean)
    .join(" ");

  if (isEditing) {
    return (
      <td className={cellClassName} onClick={(event) => event.stopPropagation()}>
        <TagTypeaheadEditor
          compact
          disabled={isSaving}
          tags={parseProductTagsValue(editValue)}
          suggestions={tagSuggestions}
          placeholder="Search tags"
          onChange={(nextTags) => onTagsChange(serializeProductTags(nextTags))}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      </td>
    );
  }

  return (
    <td
      className={cellClassName}
      title="Double-click to edit tags"
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartEdit();
      }}
    >
      <div className="product-tag-tags">
        {productTags.length > 0 ? (
          productTags.map((tag) => (
            <span key={tag} className="product-tag-pill">
              {tag}
            </span>
          ))
        ) : (
          <span className="product-tag-pill-empty">—</span>
        )}
      </div>
    </td>
  );
}

function ProductInlineSelectCell({
  className,
  display,
  editValue,
  options,
  isEditing,
  isSaving,
  onStartEdit,
  onSelect,
  onCancel
}: {
  className?: string;
  display: ReactNode;
  editValue: string;
  options: { value: string; label: string }[];
  isEditing: boolean;
  isSaving: boolean;
  onStartEdit: () => void;
  onSelect: (value: string) => void;
  onCancel: () => void;
}) {
  const cellClassName = [
    className,
    "product-cell-editable",
    isEditing ? "product-cell-editing product-cell-select" : "",
    isSaving ? "product-cell-saving" : ""
  ]
    .filter(Boolean)
    .join(" ");

  if (isEditing) {
    return (
      <td className={cellClassName} onClick={(event) => event.stopPropagation()}>
        <select
          autoFocus
          value={editValue}
          disabled={isSaving}
          onChange={(event) => onSelect(event.target.value)}
          onBlur={() => onCancel()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        >
          {options.map((option) => (
            <option key={option.value || "__none__"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
    );
  }

  return (
    <td
      className={cellClassName}
      title="Double-click to edit"
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartEdit();
      }}
    >
      {display}
    </td>
  );
}

function ProductEditableCell({
  className,
  display,
  editValue,
  isEditing,
  isSaving,
  editable = true,
  multiline = false,
  onStartEdit,
  onChange,
  onCommit,
  onCancel
}: {
  className?: string;
  display: ReactNode;
  editValue: string;
  isEditing: boolean;
  isSaving: boolean;
  editable?: boolean;
  multiline?: boolean;
  onStartEdit: () => void;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const cellClassName = [
    className,
    editable ? "product-cell-editable" : "product-cell-readonly",
    isEditing ? "product-cell-editing" : "",
    isSaving ? "product-cell-saving" : ""
  ]
    .filter(Boolean)
    .join(" ");

  if (!editable) {
    return <td className={cellClassName}>{display}</td>;
  }

  if (isEditing) {
    return (
      <td className={cellClassName}>
        {multiline ? (
          <textarea
            autoFocus
            rows={3}
            value={editValue}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => onCommit()}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onCommit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
          />
        ) : (
          <input
            autoFocus
            value={editValue}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => onCommit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCommit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
          />
        )}
      </td>
    );
  }

  return (
    <td
      className={cellClassName}
      title="Double-click to edit"
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartEdit();
      }}
    >
      {display}
    </td>
  );
}

function ProductTableRow({
  product,
  categories,
  pricingGroups,
  tagSuggestions,
  inlineEdit,
  savingCellKey,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  onSelectFieldChange,
  onOpenEditModal,
  onToggleStar,
  isStarSaving
}: {
  product: Product;
  categories: ProductCategory[];
  pricingGroups: string[];
  tagSuggestions: string[];
  inlineEdit: { productId: string; column: ProductInlineColumn; value: string } | null;
  savingCellKey: string | null;
  onStartEdit: (product: Product, column: ProductInlineColumn) => void;
  onEditChange: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onSelectFieldChange: (column: ProductInlineColumn, value: string) => void;
  onOpenEditModal: () => void;
  onToggleStar: () => void;
  isStarSaving: boolean;
}) {
  const isEditingColumn = (column: ProductInlineColumn) =>
    inlineEdit?.productId === product.id && inlineEdit.column === column;
  const isSavingColumn = (column: ProductInlineColumn) =>
    savingCellKey === productInlineCellKey(product.id, column);
  const cellProps = (column: ProductInlineColumn) => ({
    editValue: inlineEdit?.productId === product.id && inlineEdit.column === column ? inlineEdit.value : "",
    isEditing: isEditingColumn(column),
    isSaving: isSavingColumn(column),
    onStartEdit: () => onStartEdit(product, column),
    onChange: onEditChange,
    onCommit: onCommitEdit,
    onCancel: onCancelEdit
  });

  return (
    <tr>
      <td className="sticky-col-star product-cell-readonly">
        <button
          type="button"
          className={`product-star-btn${product.is_starred ? " is-starred" : ""}`}
          aria-label={product.is_starred ? `Unstar ${product.name}` : `Star ${product.name}`}
          aria-pressed={product.is_starred}
          disabled={isStarSaving}
          onClick={onToggleStar}
        >
          {product.is_starred ? "★" : "☆"}
        </button>
      </td>
      <td className="sticky-col-image product-cell-readonly">
        {product.image_url ? (
          <img className="product-thumb" src={product.image_url} alt={product.name} />
        ) : (
          <div className="product-thumb product-thumb-empty">No image</div>
        )}
      </td>
      <ProductEditableCell
        {...cellProps("name")}
        className="sticky-col-product"
        display={<strong>{product.name}</strong>}
      />
      <td className="product-cell-mono product-cell-readonly">{product.id}</td>
      <ProductEditableCell
        {...cellProps("sku")}
        className="product-cell-mono"
        display={product.sku ?? "—"}
      />
      <ProductEditableCell
        {...cellProps("short_description")}
        className="product-cell-clip"
        multiline
        display={truncateProductCell(product.short_description || "—", 96)}
      />
      <ProductEditableCell
        {...cellProps("long_description")}
        className="product-cell-clip column-long-description"
        multiline
        display={truncateProductCell(product.long_description || "—", 96)}
      />
      <ProductEditableCell {...cellProps("base_price")} display={formatProductMoney(product.base_price)} />
      <ProductEditableCell {...cellProps("cogs_per_unit")} display={formatProductMoney(product.cogs_per_unit)} />
      <td
        className="product-cell-readonly product-cell-computed"
        title="Calculated automatically from order history"
      >
        {formatProductNumber(product.avg_order_quantity)}
      </td>
      <td
        className="product-cell-readonly product-cell-computed"
        title="Calculated automatically from order history"
      >
        {formatProductMoney(product.avg_discount_per_unit)}
      </td>
      <td
        className="product-cell-readonly product-cell-computed"
        title="Calculated automatically from order history"
      >
        {formatProductMoney(product.avg_profit_margin_per_unit)}
      </td>
      <ProductEditableCell
        {...cellProps("variations")}
        className="column-variations"
        display={
          <div className="product-variation-tags">
            {(product.variations ?? []).length > 0 ? (
              (product.variations ?? []).map((variation) => (
                <span key={`${product.id}-${variation.id}`} className="product-variation-pill">
                  {variation.name}
                </span>
              ))
            ) : (
              <span className="product-variation-pill-empty">—</span>
            )}
          </div>
        }
      />
      <ProductInlineSelectCell
        className="product-cell-mono"
        {...cellProps("category_id")}
        display={product.category_id}
        options={categories.map((category) => ({
          value: category.slug,
          label: `${category.name} (${category.slug})`
        }))}
        onSelect={(value) => onSelectFieldChange("category_id", value)}
      />
      <ProductInlineSelectCell
        className="product-cell-mono"
        {...cellProps("pricing_group_id")}
        display={product.pricing_group_id ?? "—"}
        options={[
          { value: "", label: "No volume discount" },
          ...Array.from(
            new Set([
              ...pricingGroups,
              ...(product.pricing_group_id ? [product.pricing_group_id] : [])
            ])
          ).map((groupId) => ({ value: groupId, label: groupId }))
        ]}
        onSelect={(value) => onSelectFieldChange("pricing_group_id", value)}
      />
      <ProductTagsInlineCell
        productTags={normalizeTagList(product.tags ?? [])}
        tagSuggestions={tagSuggestions}
        editValue={inlineEdit?.productId === product.id && inlineEdit.column === "tags" ? inlineEdit.value : ""}
        isEditing={isEditingColumn("tags")}
        isSaving={isSavingColumn("tags")}
        onStartEdit={() => onStartEdit(product, "tags")}
        onTagsChange={onEditChange}
        onCommit={onCommitEdit}
        onCancel={onCancelEdit}
      />
      <ProductInlineSelectCell
        {...cellProps("active")}
        display={
          <StatusBadge label={product.active ? "Active" : "Inactive"} tone={product.active ? "good" : "neutral"} />
        }
        options={[
          { value: "true", label: "Active" },
          { value: "false", label: "Inactive" }
        ]}
        onSelect={(value) => onSelectFieldChange("active", value)}
      />
      <td className="product-cell-nowrap product-cell-readonly">{formatProductTimestamp(product.created_at)}</td>
      <td className="product-cell-nowrap product-cell-readonly">{formatProductTimestamp(product.updated_at)}</td>
      <td className="column-edit sticky-col-edit product-cell-readonly">
        <button type="button" className="icon-edit-btn" aria-label={`Edit ${product.name}`} onClick={onOpenEditModal}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 20h4l10-10-4-4L4 16v4zm12.7-13.3 1.6-1.6a1 1 0 0 1 1.4 0l1.3 1.3a1 1 0 0 1 0 1.4L19.4 9l-2.7-2.3z" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

function PromoTableRow({
  promo,
  inlineEdit,
  savingCellKey,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  onSelectFieldChange,
  onDelete,
  isBusy
}: {
  promo: PromoCode;
  inlineEdit: { promoId: string; column: PromoInlineColumn; value: string } | null;
  savingCellKey: string | null;
  onStartEdit: (promo: PromoCode, column: PromoInlineColumn) => void;
  onEditChange: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onSelectFieldChange: (column: PromoInlineColumn, value: string) => void;
  onDelete: () => void;
  isBusy: boolean;
}) {
  const isEditingColumn = (column: PromoInlineColumn) =>
    inlineEdit?.promoId === promo.id && inlineEdit.column === column;
  const isSavingColumn = (column: PromoInlineColumn) => savingCellKey === promoInlineCellKey(promo.id, column);
  const cellProps = (column: PromoInlineColumn) => ({
    editValue: inlineEdit?.promoId === promo.id && inlineEdit.column === column ? inlineEdit.value : "",
    isEditing: isEditingColumn(column),
    isSaving: isSavingColumn(column),
    onStartEdit: () => onStartEdit(promo, column),
    onChange: onEditChange,
    onCommit: onCommitEdit,
    onCancel: onCancelEdit
  });

  return (
    <tr>
      <ProductEditableCell {...cellProps("code")} display={<strong>{promo.code}</strong>} />
      <td className="product-cell-mono product-cell-readonly">{promo.id}</td>
      <ProductEditableCell
        {...cellProps("description")}
        className="product-cell-clip"
        multiline
        display={truncateProductCell(promo.description || "—", 96)}
      />
      <ProductInlineSelectCell
        {...cellProps("discount_type")}
        display={promo.discount_type === "percent" ? "Percent" : "Fixed"}
        options={[
          { value: "percent", label: "Percent" },
          { value: "fixed", label: "Fixed" }
        ]}
        onSelect={(value) => onSelectFieldChange("discount_type", value)}
      />
      <ProductEditableCell {...cellProps("discount_value")} display={formatPromoDiscountValue(promo)} />
      <ProductEditableCell {...cellProps("min_subtotal")} display={`$${Number(promo.min_subtotal).toFixed(2)}`} />
      <ProductEditableCell
        {...cellProps("max_discount")}
        display={promo.max_discount == null ? "—" : `$${Number(promo.max_discount).toFixed(2)}`}
      />
      <ProductEditableCell
        {...cellProps("usage_limit")}
        display={promo.usage_limit == null ? "Unlimited" : String(promo.usage_limit)}
      />
      <td className="product-cell-readonly">
        {promo.used_count}
        {promo.usage_limit ? ` / ${promo.usage_limit}` : ""}
      </td>
      <ProductInlineSelectCell
        {...cellProps("active")}
        display={
          <StatusBadge label={promo.active ? "Active" : "Inactive"} tone={promo.active ? "good" : "neutral"} />
        }
        options={[
          { value: "true", label: "Active" },
          { value: "false", label: "Inactive" }
        ]}
        onSelect={(value) => onSelectFieldChange("active", value)}
      />
      <td className="column-edit product-cell-readonly">
        <button
          type="button"
          className="icon-edit-btn icon-delete-btn"
          aria-label={`Delete ${promo.code}`}
          disabled={isBusy}
          onClick={onDelete}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "good" | "neutral" }) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ""}`.trim()}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
  size = "default"
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "default" | "wide" | "fullscreen";
}) {
  if (!open) return null;
  const sizeClass =
    size === "fullscreen" ? "modal-card-fullscreen" : size === "wide" ? "modal-card-wide" : "";
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card ${sizeClass}`.trim()} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h4>{title}</h4>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
