import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ApiClient } from "./api";
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
const ADMIN_TOKEN_KEY = "top-cola-admin-token";
type AdminTab = "products" | "promos" | "rules" | "categories" | "settings";
const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "promos", label: "Promo Codes" },
  { id: "rules", label: "Pricing Rules" },
  { id: "categories", label: "Categories" },
  { id: "settings", label: "Settings" }
];
const STATUS_OPTIONS: OrderRecord["status"][] = [
  "pending",
  "out_for_delivery",
  "complete",
  "cancelled"
];
const STATUS_LABELS: Record<OrderRecord["status"], string> = {
  pending: "Pending",
  out_for_delivery: "Out for Delivery",
  complete: "Complete",
  cancelled: "Cancelled"
};
type AddModalKind = "product" | "promo" | "rule" | "category" | null;
type OrderDateFilter = "today" | "yesterday" | "last7" | "all";
interface ProductDraft {
  sku: string;
  name: string;
  description: string;
  basePrice: string;
  categorySlug: string;
  pricingGroupSlug: string;
  active: boolean;
}

interface OrderEditorItem {
  productId: string;
  quantity: string;
  variationId?: string;
}

const EMPTY_PRODUCT_DRAFT: ProductDraft = {
  sku: "",
  name: "",
  description: "",
  basePrice: "0",
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

const normalizeTagList = (entries: string[]): string[] => {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of entries) {
    const cleaned = entry.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(cleaned);
  }
  return tags;
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
  const [token, setToken] = useState<string | null>(null);
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
  const [promoSearch, setPromoSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<"all" | OrderRecord["status"]>("all");
  const [orderDateFilter, setOrderDateFilter] = useState<OrderDateFilter>("today");
  const [updatingOrderIds, setUpdatingOrderIds] = useState<string[]>([]);
  const [adminTab, setAdminTab] = useState<AdminTab>("products");

  const [productDraft, setProductDraft] = useState<ProductDraft>(EMPTY_PRODUCT_DRAFT);
  const [productVariationsDraft, setProductVariationsDraft] = useState<ProductVariation[]>([]);
  const [productTagsDraft, setProductTagsDraft] = useState<string[]>([]);
  const [variationInputValue, setVariationInputValue] = useState("");
  const [tagInputValue, setTagInputValue] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
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
    scheduledDeliveryTime: "",
    status: "pending" as OrderRecord["status"],
    customDiscount: "0",
    note: ""
  });
  const [orderEditorItems, setOrderEditorItems] = useState<OrderEditorItem[]>([]);
  const [orderQuotePreview, setOrderQuotePreview] = useState<{
    subtotal: number;
    total: number;
    savings: number;
    volumeDiscount: number;
    promoDiscount: number;
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

  useEffect(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    void loadAll();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (adminTab === "products" || adminTab === "categories") {
      void loadCategories();
    }
  }, [token, adminTab]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const publicClient = new ApiClient(apiBaseUrl, null);
      const result = await publicClient.request<{ token: string }>("/admin/login", "POST", { password });
      setToken(result.token);
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
    setToken(null);
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

  const openCreateProductModal = () => {
    setEditingProductId(null);
    setProductDraft(EMPTY_PRODUCT_DRAFT);
    setProductVariationsDraft([]);
    setProductTagsDraft([]);
    setProductImages([]);
    setVariationInputValue("");
    setTagInputValue("");
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
      description: product.description ?? "",
      basePrice: Number(product.base_price).toString(),
      categorySlug: product.category_slug,
      pricingGroupSlug: product.pricing_group_slug ?? "",
      active: product.active
    });
    setProductVariationsDraft(normalizeVariationList((product.variations ?? []).map((variation) => variation.name)));
    setProductTagsDraft(normalizeTagList(product.tags ?? []));
    await loadProductImages(product.id);
    setVariationInputValue("");
    setTagInputValue("");
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

  const addProductTag = () => {
    const nextTag = tagInputValue.trim();
    if (!nextTag) return;
    setProductTagsDraft((current) => normalizeTagList([...current, nextTag]));
    setTagInputValue("");
  };

  const removeProductTag = (tagToRemove: string) => {
    setProductTagsDraft((current) => current.filter((tag) => tag !== tagToRemove));
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

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      const payload = {
        sku: productDraft.sku || undefined,
        name: productDraft.name,
        description: productDraft.description,
        basePrice: Number(productDraft.basePrice),
        categorySlug: productDraft.categorySlug,
        pricingGroupSlug: productDraft.pricingGroupSlug || null,
        variations: productVariationsDraft,
        tags: productTagsDraft,
        active: productDraft.active
      };

      if (editingProductId) {
        await client.request<{ product: Product }>(`/admin/products/${editingProductId}`, "PATCH", payload);
      } else {
        await client.request<{ product: Product }>("/admin/products", "POST", payload);
      }

      setEditingProductId(null);
      setProductDraft(EMPTY_PRODUCT_DRAFT);
      setProductVariationsDraft([]);
      setProductTagsDraft([]);
      setProductImages([]);
      setVariationInputValue("");
      setTagInputValue("");
      setActiveAddModal(null);
      await loadAll();
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
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUpdatingOrderIds((current) => current.filter((id) => id !== orderId));
      setIsBusy(false);
    }
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
    const defaultProduct = products[0];
    if (!defaultProduct) return;
    setOrderEditorItems((current) => [
      ...current,
      {
        productId: defaultProduct.id,
        quantity: "1"
      }
    ]);
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
    setOrderQuotePreview(null);
    setOrderEditor({
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      deliveryAddress: "",
      deliveryInstructions: "",
      paymentMethod: "cash",
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
        scheduledDeliveryTime: orderEditor.scheduledDeliveryTime
          ? new Date(orderEditor.scheduledDeliveryTime).toISOString()
          : null,
        status: orderEditor.status,
        customDiscount: Number(orderEditor.customDiscount) || 0,
        note: orderEditor.note || undefined,
        items: payloadItems
      });

      await loadAll();
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
      product.category_name.toLowerCase().includes(search) ||
      product.category_slug.toLowerCase().includes(search) ||
      (product.pricing_group_name ?? "").toLowerCase().includes(search) ||
      (product.pricing_group_slug ?? "no_volume_discount").toLowerCase().includes(search) ||
      (product.variations ?? []).some((variation) => variation.name.toLowerCase().includes(search)) ||
      (product.tags ?? []).some((tag) => tag.toLowerCase().includes(search))
    );
  });

  const promoRows = promos.filter((promo) => {
    const search = promoSearch.trim().toLowerCase();
    if (!search) return true;
    return promo.code.toLowerCase().includes(search) || promo.id.toLowerCase().includes(search);
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
    const itemText = (order.pricing_snapshot?.items ?? [])
      .map((item) => `${item.product_name ?? ""} ${item.quantity ?? ""}`.trim())
      .join(" ")
      .toLowerCase();
    return (
      order.id.toLowerCase().includes(search) ||
      order.customer_name.toLowerCase().includes(search) ||
      order.delivery_address.toLowerCase().includes(search) ||
      STATUS_LABELS[order.status].toLowerCase().includes(search) ||
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
      }>("/pricing/quote", "POST", { items: normalizedItems })
      .then((quote) => {
        if (!cancelled) setOrderQuotePreview(quote);
      })
      .catch(() => {
        if (!cancelled) setOrderQuotePreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, isOrderEditorOpen, orderEditorItems]);
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

  if (!token) {
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
            <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? "active-link" : ""}`}>
              Admin
            </NavLink>
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
          </nav>
          <div className="site-actions">
            <button onClick={() => void loadAll()} disabled={isBusy}>
              {isBusy ? "Syncing..." : "Refresh Data"}
            </button>
            <button className="secondary" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        <section className="hero card">
          <div>
            <h2>Admin Dashboard</h2>
            <p className="status">Manage catalog, promos, pricing tiers, and incoming orders from one place.</p>
          </div>
        </section>

        <div className="kpi-grid">
          <KpiCard label="Total Orders" value={metrics?.totalOrders ?? orders.length} />
          <KpiCard label="Pending Orders" value={metrics?.pendingOrders ?? 0} />
          <KpiCard label="Active Products" value={products.filter((p) => p.active).length} />
          <KpiCard label="Active Promos" value={promos.filter((promo) => promo.active).length} />
        </div>

        <p className={`status ${error ? "error" : ""}`}>{error ?? status}</p>
        {lastSyncedAt && <p className="status">Last synced: {new Date(lastSyncedAt).toLocaleString()}</p>}

        <Routes>
          <Route
            path="/admin"
            element={
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
                  <div className="card">
                  <div className="section-header">
                    <h3>Product Management</h3>
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
                  <table className="data-table product-table">
                    <thead>
                      <tr>
                        <th className="column-edit" aria-label="Edit product" />
                        <th>Image</th>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Pricing Group</th>
                        <th className="column-tags">Tags</th>
                        <th className="column-variations">Variations</th>
                        <th>Avg Qty</th>
                        <th>Avg Discount / Unit</th>
                        <th>Avg Profit / Unit</th>
                        <th>Price</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map((p) => (
                        <tr key={p.id}>
                          <td className="column-edit">
                            <button
                              type="button"
                              className="icon-edit-btn"
                              aria-label={`Edit ${p.name}`}
                              onClick={() => void openEditProductModal(p)}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M4 20h4l10-10-4-4L4 16v4zm12.7-13.3 1.6-1.6a1 1 0 0 1 1.4 0l1.3 1.3a1 1 0 0 1 0 1.4L19.4 9l-2.7-2.3z" />
                              </svg>
                            </button>
                          </td>
                          <td>
                            {p.image_url ? (
                              <img className="product-thumb" src={p.image_url} alt={p.name} />
                            ) : (
                              <div className="product-thumb product-thumb-empty">No image</div>
                            )}
                          </td>
                          <td>
                            <strong>{p.name}</strong>
                            <div className="muted">{p.id}</div>
                          </td>
                          <td>
                            {p.category_name}
                            <div className="muted">{p.category_slug}</div>
                          </td>
                          <td>
                            {p.pricing_group_name ?? p.pricing_group_slug ?? "No volume discount"}
                            <div className="muted">{p.pricing_group_slug ?? "none"}</div>
                          </td>
                          <td className="column-variations">
                            <div className="product-tag-tags">
                              {(p.tags ?? []).length > 0 ? (
                                (p.tags ?? []).map((tag) => (
                                  <span key={`${p.id}-tag-${tag}`} className="product-tag-pill">
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                <span className="product-tag-pill-empty">No tags</span>
                              )}
                            </div>
                          </td>
                          <td className="column-variations">
                            <div className="product-variation-tags">
                              {(p.variations ?? []).length > 0 ? (
                                (p.variations ?? []).map((variation) => (
                                  <span key={`${p.id}-${variation.id}`} className="product-variation-pill">
                                    {variation.name}
                                  </span>
                                ))
                              ) : (
                                <span className="product-variation-pill-empty">No variations</span>
                              )}
                            </div>
                          </td>
                          <td>{Number(p.avg_order_quantity ?? 0).toFixed(2)}</td>
                          <td>${Number(p.avg_discount_per_unit ?? 0).toFixed(2)}</td>
                          <td>${Number(p.avg_profit_margin_per_unit ?? 0).toFixed(2)}</td>
                          <td>${Number(p.base_price).toFixed(2)}</td>
                          <td>
                            <StatusBadge label={p.active ? "Active" : "Inactive"} tone={p.active ? "good" : "neutral"} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}

                {adminTab === "promos" && (
                  <div className="card">
                  <div className="section-header">
                    <h3>Promo Code Management</h3>
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
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Type</th>
                        <th>Value</th>
                        <th>Min Subtotal</th>
                        <th>Used</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promoRows.map((promo) => (
                        <tr key={promo.id}>
                          <td>
                            <strong>{promo.code}</strong>
                            <div className="muted">{promo.id}</div>
                          </td>
                          <td>{promo.discount_type}</td>
                          <td>{promo.discount_value}</td>
                          <td>${promo.min_subtotal.toFixed(2)}</td>
                          <td>
                            {promo.used_count}
                            {promo.usage_limit ? ` / ${promo.usage_limit}` : ""}
                          </td>
                          <td>
                            <StatusBadge label={promo.active ? "Active" : "Inactive"} tone={promo.active ? "good" : "neutral"} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
            }
          />
          <Route
            path="/orders"
            element={
              <div className="page-stack">
                <div className="card">
                  <h3>Overview Stats</h3>
                  <div className="metrics-grid">
                    {Object.entries(metrics?.byStatus ?? {}).map(([statusName, count]) => (
                      <div className="metric-chip" key={statusName}>
                        <span>
                          {statusName === "pending"
                            ? "Pending"
                            : statusName === "out_for_delivery"
                              ? "Out for Delivery"
                              : statusName === "complete"
                                ? "Complete"
                                : statusName === "cancelled"
                                  ? "Cancelled"
                                  : statusName}
                        </span>
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
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Price</th>
                                <th>Profit</th>
                                <th>Scheduled</th>
                                <th>Order Placed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bucket.rows.map((order) => (
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
                                  <td>
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
                                  <td>${Number(order.gross_profit ?? 0).toFixed(2)}</td>
                                  <td>{formatScheduledTime(order.scheduled_delivery_time)}</td>
                                  <td>{formatOrderPlacedTime(order.created_at)}</td>
                                </tr>
                              ))}
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
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>

        <Modal
          open={activeAddModal === "product"}
          title={editingProductId ? "Edit Product" : "Add Product"}
          onClose={() => {
            setEditingProductId(null);
            setVariationInputValue("");
            setTagInputValue("");
            setProductImages([]);
            setProductVariationsDraft([]);
            setProductTagsDraft([]);
            setProductDraft(EMPTY_PRODUCT_DRAFT);
            setActiveAddModal(null);
          }}
        >
          <form onSubmit={saveProduct}>
            <Field label="SKU (optional)">
              <input value={productDraft.sku} onChange={(e) => setProductDraft((p) => ({ ...p, sku: e.target.value }))} />
            </Field>
            <Field label="Product name">
              <input required value={productDraft.name} onChange={(e) => setProductDraft((p) => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Base price">
              <input type="number" step="0.01" value={productDraft.basePrice} onChange={(e) => setProductDraft((p) => ({ ...p, basePrice: e.target.value }))} />
            </Field>
            <Field label="Category">
              <select value={productDraft.categorySlug} onChange={(e) => setProductDraft((p) => ({ ...p, categorySlug: e.target.value }))}>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name} ({category.slug})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pricing group">
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
            <Field label="Description">
              <textarea value={productDraft.description} onChange={(e) => setProductDraft((p) => ({ ...p, description: e.target.value }))} />
            </Field>
            <Field label="Variations (optional)">
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
            <Field label="Tags (optional)">
              <div className="variation-editor">
                <div className="variation-tags">
                  {productTagsDraft.length > 0 ? (
                    productTagsDraft.map((tag) => (
                      <span key={tag} className="variation-tag">
                        {tag}
                        <button
                          type="button"
                          className="variation-tag-remove"
                          onClick={() => removeProductTag(tag)}
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
                <div className="variation-entry-row">
                  <input
                    placeholder="Type a tag and press Enter"
                    value={tagInputValue}
                    onChange={(e) => setTagInputValue(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addProductTag();
                      }
                    }}
                  />
                  <button type="button" className="small-action-btn" onClick={addProductTag}>
                    Add
                  </button>
                </div>
              </div>
            </Field>
            <Field label="Product Images">
              {editingProductId ? (
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
                      const files = Array.from(event.dataTransfer.files).filter((file) =>
                        file.type.startsWith("image/")
                      );
                      void uploadProductImages(files);
                    }}
                  >
                    <p>Drag and drop images here</p>
                    <label className="dropzone-button">
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          void uploadProductImages(files);
                          event.currentTarget.value = "";
                        }}
                      />
                      {isUploadingImages ? "Uploading..." : "Upload Images"}
                    </label>
                  </div>

                  <div className="image-section">
                    <h4>Primary Image</h4>
                    {productImages.find((image) => image.is_primary) ? (
                      <img
                        className="primary-image-preview"
                        src={productImages.find((image) => image.is_primary)?.image_url}
                        alt="Primary product"
                      />
                    ) : (
                      <p className="muted">No primary image selected yet.</p>
                    )}
                  </div>

                  <div className="image-section">
                    <h4>Gallery Images</h4>
                    {productImages.length === 0 ? (
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
                    )}
                  </div>
                </div>
              ) : (
                <p className="muted">Save the product first, then upload primary and gallery images.</p>
              )}
            </Field>
            <div style={{ marginTop: 10 }} className="actions">
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
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Rule Price</th>
                      <th>Line Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {orderEditorItems.map((item, index) => {
                      const quantity = Number(item.quantity) || 0;
                      const basePrice = Number(productById.get(item.productId)?.base_price ?? 0);
                      const lineEstimate = basePrice * quantity;
                      return (
                        <tr key={`order-item-${index}`}>
                          <td>
                            <select
                              value={item.productId}
                              onChange={(event) => updateOrderEditorItem(index, { productId: event.target.value })}
                            >
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} ({product.id})
                                </option>
                              ))}
                            </select>
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
                          <td>${lineEstimate.toFixed(2)}</td>
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
                  <span>Subtotal</span>
                  <strong>${orderEditorTotals.subtotal.toFixed(2)}</strong>
                  <span>Rule Total (after standard discounts)</span>
                  <strong>${orderEditorTotals.quoteTotal.toFixed(2)}</strong>
                  <span>Custom Discount</span>
                  <strong>-${orderEditorTotals.customDiscount.toFixed(2)}</strong>
                  <span>Total</span>
                  <strong>${orderEditorTotals.total.toFixed(2)}</strong>
                  <span>Estimated Profit</span>
                  <strong>${orderEditorTotals.grossProfit.toFixed(2)}</strong>
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

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "good" | "neutral" }) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
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
  size?: "default" | "fullscreen";
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card ${size === "fullscreen" ? "modal-card-fullscreen" : ""}`} onClick={(event) => event.stopPropagation()}>
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
