import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ApiClient } from "./api";
import type {
  OrderMetrics,
  OrderRecord,
  OrderSettings,
  PricingRule,
  PricingTier,
  Product,
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
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled"
];
type AddModalKind = "product" | "promo" | "rule" | "category" | null;

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
  const [settings, setSettings] = useState<OrderSettings>({ minOrderAmount: 0 });
  const [minOrderAmountInput, setMinOrderAmountInput] = useState("0");
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [promoSearch, setPromoSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [adminTab, setAdminTab] = useState<AdminTab>("products");

  const [newProduct, setNewProduct] = useState({
    sku: "",
    name: "",
    description: "",
    imageUrl: "",
    basePrice: "0",
    categorySlug: "vapes",
    pricingGroupSlug: "",
    active: true
  });

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
      const [productsRes, promosRes, rulesRes, ordersRes, metricsRes, settingsRes] = await Promise.all([
        client.request<{ products: Product[] }>("/admin/products"),
        client.request<{ promos: PromoCode[] }>("/admin/promos"),
        client.request<{ pricingRules: PricingRule[] }>("/admin/pricing-rules"),
        client.request<{ orders: OrderRecord[] }>("/admin/orders"),
        client.request<OrderMetrics>("/admin/metrics/orders"),
        client.request<OrderSettings>("/admin/settings/order-minimum")
      ]);
      setProducts(productsRes.products);
      setPromos(promosRes.promos);
      setRules(rulesRes.pricingRules);
      setOrders(ordersRes.orders);
      setMetrics(metricsRes);
      setSettings(settingsRes);
      setMinOrderAmountInput(settingsRes.minOrderAmount.toString());
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
    setSettings({ minOrderAmount: 0 });
    setMinOrderAmountInput("0");
    setStatus("Logged out");
  };

  const createProduct = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      await client.request<{ product: Product }>("/admin/products", "POST", {
        sku: newProduct.sku || undefined,
        name: newProduct.name,
        description: newProduct.description,
        imageUrl: newProduct.imageUrl || undefined,
        basePrice: Number(newProduct.basePrice),
        categorySlug: newProduct.categorySlug,
        pricingGroupSlug: newProduct.pricingGroupSlug || null,
        active: newProduct.active
      });
      setNewProduct((prev) => ({ ...prev, sku: "", name: "", description: "", imageUrl: "" }));
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
    setIsBusy(true);
    setError(null);
    try {
      await client.request(`/admin/orders/${orderId}/status`, "PATCH", { status: statusValue });
      await loadAll();
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
      const updated = await client.request<OrderSettings>("/admin/settings/order-minimum", "PATCH", {
        minOrderAmount: Number.isFinite(nextValue) && nextValue >= 0 ? nextValue : 0
      });
      setSettings(updated);
      setMinOrderAmountInput(updated.minOrderAmount.toString());
      setStatus("Minimum order updated");
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
      (product.pricing_group_slug ?? "no_volume_discount").toLowerCase().includes(search)
    );
  });

  const promoRows = promos.filter((promo) => {
    const search = promoSearch.trim().toLowerCase();
    if (!search) return true;
    return promo.code.toLowerCase().includes(search) || promo.id.toLowerCase().includes(search);
  });

  const orderRows = orders.filter((order) => {
    const search = orderSearch.trim().toLowerCase();
    if (!search) return true;
    return (
      order.id.toLowerCase().includes(search) ||
      order.customer_name.toLowerCase().includes(search) ||
      order.status.toLowerCase().includes(search)
    );
  });

  const productGroups = [
    ...new Set([
      ...rules.map((rule) => rule.pricing_group_id),
      ...products.map((p) => p.pricing_group_slug).filter((slug): slug is string => Boolean(slug))
    ])
  ];

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((category) => category.slug === newProduct.categorySlug)) {
      setNewProduct((prev) => ({ ...prev, categorySlug: categories[0].slug }));
    }
  }, [categories, newProduct.categorySlug]);

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
              Orders
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
                      <button type="button" onClick={() => setActiveAddModal("product")}>
                        Add Product
                      </button>
                    </div>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Image</th>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Pricing Group</th>
                        <th>Price</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map((p) => (
                        <tr key={p.id}>
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
                    </div>
                    <div className="actions">
                      <button type="button" onClick={() => void saveMinimumOrder()} disabled={isBusy}>
                        Save Minimum Order
                      </button>
                    </div>
                    <p className="status">Current minimum: ${settings.minOrderAmount.toFixed(2)}</p>
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
                        <span>{statusName}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="section-header">
                    <h3>Order Queue</h3>
                    <input
                      className="search-input"
                      placeholder="Search order, customer, or status"
                      value={orderSearch}
                      onChange={(event) => setOrderSearch(event.target.value)}
                    />
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Savings</th>
                        <th>Total</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderRows.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <strong>{order.id}</strong>
                          </td>
                          <td>
                            <strong>{order.customer_name}</strong>
                            <div className="muted">{order.customer_phone}</div>
                          </td>
                          <td>
                            <select
                              value={order.status}
                              onChange={(e) => void updateOrderStatus(order.id, e.target.value as OrderRecord["status"])}
                            >
                              {STATUS_OPTIONS.map((statusOption) => (
                                <option key={statusOption} value={statusOption}>
                                  {statusOption}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>${Number(order.savings).toFixed(2)}</td>
                          <td>${Number(order.total).toFixed(2)}</td>
                          <td>{new Date(order.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>

        <Modal
          open={activeAddModal === "product"}
          title="Add Product"
          onClose={() => setActiveAddModal(null)}
        >
          <form onSubmit={createProduct}>
            <Field label="SKU (optional)">
              <input value={newProduct.sku} onChange={(e) => setNewProduct((p) => ({ ...p, sku: e.target.value }))} />
            </Field>
            <Field label="Product name">
              <input required value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Base price">
              <input type="number" step="0.01" value={newProduct.basePrice} onChange={(e) => setNewProduct((p) => ({ ...p, basePrice: e.target.value }))} />
            </Field>
            <Field label="Image URL">
              <input value={newProduct.imageUrl} onChange={(e) => setNewProduct((p) => ({ ...p, imageUrl: e.target.value }))} />
            </Field>
            <Field label="Category">
              <select value={newProduct.categorySlug} onChange={(e) => setNewProduct((p) => ({ ...p, categorySlug: e.target.value }))}>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name} ({category.slug})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pricing group">
              <select
                value={newProduct.pricingGroupSlug}
                onChange={(e) => setNewProduct((p) => ({ ...p, pricingGroupSlug: e.target.value }))}
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
              <textarea value={newProduct.description} onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))} />
            </Field>
            <div style={{ marginTop: 10 }} className="actions">
              <button type="submit" disabled={isBusy}>Add Product</button>
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
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
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
