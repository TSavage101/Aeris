"use client";

import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { CartLine, CheckoutDetails, Order, OrderStatus, PayoutRequest, Product, Store, SupportedCity } from "@/lib/aeris";
import { useEffect, useMemo, useState } from "react";
import {
  SUPPORTED_CITIES,
  allocatePayout,
  availableBalance,
  calculateCheckout,
  canTransitionOrder,
  cryptoId,
  generateAiProducts,
  isSupportedCity,
  makeProduct,
  money,
  parseProductsBulk,
  slugify
} from "@/lib/aeris";

type Draft = {
  storeName: string;
  category: string;
  city: SupportedCity;
  description: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  primary: string;
  tagline: string;
  logoUrl: string;
  heroImageUrl: string;
  productsText: string;
};

type State = {
  draft: Draft;
  store: Store;
  orders: Order[];
  payouts: PayoutRequest[];
  cart: CartLine[];
  activity: string[];
};

const defaultDraft: Draft = {
  storeName: "Terra Basket",
  category: "Food & Groceries",
  city: "Lagos",
  description: "Fresh pantry bundles, party trays, and weekly provisions for busy Lagos homes.",
  bankName: "Kora Demo Bank",
  accountNumber: "0123456789",
  accountName: "Terra Basket Foods",
  primary: "#1A3C2B",
  tagline: "Fresh provisions delivered across Lagos.",
  logoUrl: "",
  heroImageUrl: "",
  productsText:
    "Smoked Jollof Party Tray | 18500 | Family-size smoky jollof rice with fried plantain\nPalm Oil Pantry Set | 14500 | Local pantry staples packed for weekly cooking"
};

function buildStore(draft: Draft): Store {
  const merchantProducts = parseProductsBulk(draft.productsText).map((product, index) => makeProduct(product, index));
  const products = [...merchantProducts, ...generateAiProducts(draft.category, Math.max(0, 3 - merchantProducts.length), merchantProducts.length)];

  return {
    id: cryptoId("store"),
    slug: slugify(draft.storeName),
    name: draft.storeName,
    city: draft.city,
    category: draft.category,
    logoUrl: draft.logoUrl,
    heroImageUrl: draft.heroImageUrl,
    bankVerified: draft.accountNumber.length === 10,
    published: false,
    suspended: false,
    theme: {
      primary: draft.primary,
      secondary: "#FF8C69",
      accent: "#9EFFBF",
      template: "provisions"
    },
    heroTitle: `${draft.storeName.toUpperCase()} DELIVERED FAST.`,
    heroCopy: draft.tagline,
    products
  };
}

const initialState: State = {
  draft: defaultDraft,
  store: buildStore(defaultDraft),
  orders: [],
  payouts: [],
  cart: [],
  activity: ["Draft storefront prepared from merchant details"]
};

const RESERVED_SLUGS = new Set(["admin", "app", "www", "api", "aeris", "terra-basket-demo", "kora-market"]);
const COLOR_PRESETS = [
  ["Forest", "#1A3C2B"],
  ["Coral", "#FF8C69"],
  ["Blue", "#1D4ED8"],
  ["Red", "#C1121F"],
  ["Green", "#15803D"],
  ["Gold", "#8B6914"],
  ["Plum", "#3D2B56"],
  ["Slate", "#2B4C5C"]
] as const;

function serializeProducts(products: Array<{ name: string; price: number; description?: string; imageUrl?: string }>) {
  return products
    .map((product) => `${product.name} | ${product.price || ""} | ${product.description || ""} | ${product.imageUrl || ""}`)
    .join("\n");
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16) || 0,
    g: Number.parseInt(normalized.slice(2, 4), 16) || 0,
    b: Number.parseInt(normalized.slice(4, 6), 16) || 0
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function isSlugAvailable(slug: string, currentSlug?: string) {
  return slug.length >= 3 && (slug === currentSlug || !RESERVED_SLUGS.has(slug));
}

function persistState(nextState: State) {
  localStorage.setItem("aeris-product-state", JSON.stringify(nextState));
}

export function AerisProduct() {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<State>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("aeris-product-state");
    if (saved) {
      setState(JSON.parse(saved) as State);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem("aeris-product-state", JSON.stringify(state));
    }
  }, [hydrated, state]);

  function go(path: string) {
    router.push(path);
  }

  function update(mutator: (current: State) => State) {
    setState((current) => mutator(current));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 4000);
  }

  const common = { state, update, go, notify };

  return (
    <div className="app-page">
      {pathname === "/" && <Landing {...common} />}
      {pathname === "/onboarding" && <Onboarding {...common} />}
      {pathname === "/onboarding/generating" && <Generating {...common} />}
      {pathname === "/onboarding/preview" && <Preview {...common} />}
      {pathname === "/claim" && <Claim {...common} />}
      {["/dashboard", "/store"].includes(pathname) && <Dashboard {...common} section="store" />}
      {pathname === "/products" && <Dashboard {...common} section="products" />}
      {pathname === "/orders" && <Dashboard {...common} section="orders" />}
      {pathname === "/payouts" && <Dashboard {...common} section="payouts" />}
      {pathname === "/settings" && <Dashboard {...common} section="settings" />}
      {pathname.startsWith("/s/") && <PublicStore {...common} />}
      {pathname === "/cart" && <CartPage {...common} />}
      {pathname === "/checkout" && <CheckoutPage {...common} />}
      {pathname.startsWith("/order/") && <OrderStatus {...common} />}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-square" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

type CommonProps = {
  state: State;
  update: (mutator: (current: State) => State) => void;
  go: (path: string) => void;
  notify: (message: string) => void;
};

function Corners() {
  return (
    <>
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
    </>
  );
}

function StatusBadge({ children }: { children: string }) {
  return (
    <span className="status-badge">
      <span className="status-dot" />
      <span>{children}</span>
    </span>
  );
}

function BrandNav({ state, update, go }: Pick<CommonProps, "state" | "update" | "go">) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const links = [
    ["/store", "01. Store"],
    ["/products", "02. Products"],
    ["/orders", "03. Orders"],
    ["/payouts", "04. Payouts"],
    ["/settings", "05. Settings"]
  ];

  return (
    <header className="merchant-nav">
      <button className="brand-lockup" onClick={() => go("/store")} aria-label="Aeris dashboard">
        <span className="logo-box">A</span>
        <span className="wordmark">AERIS</span>
        <StatusBadge>{state.store.published ? "LIVE" : "DRAFT"}</StatusBadge>
      </button>
      <nav className="nav-center" aria-label="Merchant navigation">
        {links.map(([href, label]) => (
          <button className={`nav-link ${pathname === href ? "active" : ""}`} key={href} onClick={() => go(href)}>
            {label}
          </button>
        ))}
      </nav>
      <button className="hamburger" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
        <span />
        <span />
        <span />
      </button>
      <div className="nav-actions">
        <button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>
          View store ↗
        </button>
        <button
          className="btn-primary"
          onClick={() => {
            const nextState = { ...state, store: { ...state.store, published: !state.store.published } };
            persistState(nextState);
            update(() => nextState);
          }}
        >
          {state.store.published ? "Unpublish" : "Publish"}
        </button>
      </div>
      {drawerOpen && (
        <>
          <button className="drawer-backdrop" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />
          <aside className="mobile-drawer" aria-label="Mobile merchant navigation">
            <div className="brand-lockup">
              <span className="logo-box">A</span>
              <span className="wordmark">AERIS</span>
            </div>
            {links.map(([href, label]) => (
              <button
                className={`nav-link ${pathname === href ? "active" : ""}`}
                key={href}
                onClick={() => {
                  setDrawerOpen(false);
                  go(href);
                }}
              >
                {label}
              </button>
            ))}
            <button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>View store ↗</button>
          </aside>
        </>
      )}
    </header>
  );
}

function Landing({ go }: CommonProps) {
  return (
    <>
      <section className="container landing-hero">
        <div>
          <StatusBadge>AERIS MVP — AFRICAN COMMERCE INFRASTRUCTURE</StatusBadge>
          <h1 className="hero-lines">
            <span>LAUNCH YOUR</span>
            <span>STORE IN</span>
            <span>MINUTES.</span>
          </h1>
          <div className="subtext-rail">AI-powered storefronts. Real payments. Built for African merchants.</div>
          <div className="row">
            <button className="btn-primary" onClick={() => go("/onboarding")}>
              Start building →
            </button>
            <button className="btn-ghost" onClick={() => go("/s/terra-basket")}>
              View demo
            </button>
          </div>
        </div>
        <div className="wireframe-box">
          <div className="orbit" />
          <span className="orbit-node one" />
          <span className="orbit-node two" />
          <span className="orbit-node three" />
          <div className="mock-store">
            <span className="label">terra-basket.aeris.store</span>
            <h3>Fresh provisions, paid through Kora.</h3>
            <div className="mock-product-grid">
              <div>JOLLOF TRAY</div>
              <div>PALM OIL SET</div>
              <div>MARKET BUNDLE</div>
              <div>₦45,500 TOTAL</div>
            </div>
          </div>
        </div>
      </section>
      <section className="section-block">
        <div className="container">
          <span className="label">02. Features</span>
          <h2 className="section-heading">Everything you need.</h2>
          <div className="bento-grid">
            <Feature accent="accent-coral" label="// AI-POWERED" title="Store generation in minutes" body="Turn structured business details into storefront copy, theme configuration, and starter product content." />
            <Feature accent="accent-mint" label="// KORA-POWERED" title="Real payments, real money" body="Hosted checkout, payment confirmation, and merchant balances designed around African commerce." />
            <Feature accent="accent-gold" label="// OPERATIONS" title="Manage from one place" body="Products, paid orders, payout requests, and activity history live in one focused dashboard." />
            <Feature accent="accent-forest" label="// PAYOUTS" title="Your earnings, your timing" body="Earnings unlock through fulfillment progress, then merchants request payouts when ready." />
          </div>
        </div>
      </section>
      <section className="section-block">
        <div className="container" style={{ maxWidth: 640 }}>
          <span className="label">03. Get started</span>
          <h2>Ready to launch?</h2>
          <div className="form-card corner-marked">
            <Corners />
            <div className="field">
              <label className="field-label" htmlFor="landing-email">Your email address</label>
              <input id="landing-email" className="field-input" placeholder="merchant@example.com" />
            </div>
            <button className="btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={() => go("/onboarding")}>
              Start building →
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function Feature({ accent, label, title, body }: { accent: string; label: string; title: string; body: string }) {
  return (
    <div className={`bento-cell ${accent}`}>
      <span className="label">{label}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      <div className="code-box">store.status = LIVE;<br />payment.rail = KORA;<br />tenant.mode = SHARED;</div>
    </div>
  );
}

function Onboarding({ state, update, go }: CommonProps) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"manual" | "bulk">("manual");
  const draft = state.draft;
  const parsedProducts = useMemo(() => parseProductsBulk(draft.productsText), [draft.productsText]);
  const progress = (step / 5) * 100;

  function setDraft(patch: Partial<Draft>) {
    update((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  }

  function setProducts(products: Array<{ name: string; price: number; description?: string; imageUrl?: string }>) {
    setDraft({ productsText: serializeProducts(products) });
  }

  function updateProductRow(index: number, patch: Partial<{ name: string; price: number; description: string; imageUrl: string }>) {
    const products = parsedProducts.map((product) => ({ ...product }));
    products[index] = { ...products[index], ...patch };
    setProducts(products);
  }

  function addProductRow() {
    if (parsedProducts.length >= 10) {
      return;
    }

    setProducts([...parsedProducts, { name: `New Product ${parsedProducts.length + 1}`, price: 1000, description: "", imageUrl: "" }]);
  }

  function removeProductRow(index: number) {
    if (parsedProducts.length <= 1) {
      return;
    }

    setProducts(parsedProducts.filter((_, productIndex) => productIndex !== index));
  }

  function attachCloudinaryImage(index: number, fileName: string) {
    const safeName = slugify(fileName.replace(/\.[^.]+$/, "") || `product-${index + 1}`);
    updateProductRow(index, { imageUrl: `cloudinary://aeris-products/${safeName}` });
  }

  function next() {
    if (step < 5) {
      setStep(step + 1);
      return;
    }
    const store = buildStore(draft);
    update((current) => ({ ...current, store, activity: [`Generated draft for ${store.name}`, ...current.activity] }));
    go("/onboarding/generating");
  }

  return (
    <div className="wizard-shell">
      <header className="merchant-nav">
        <button className="brand-lockup" onClick={() => go("/")}>
          <span className="logo-box">A</span>
          <span className="wordmark">AERIS</span>
        </button>
        <span className="label">Step {String(step).padStart(2, "0")} of 05</span>
        <button className="btn-ghost" onClick={() => (step === 1 ? go("/") : setStep(step - 1))}>← Back</button>
      </header>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
      {step === 1 && (
        <div className="wizard-card">
          <span className="label">01. About your store</span>
          <h2>Tell us about your business.</h2>
          <p>Give Aeris the operating details it needs to generate a relevant storefront.</p>
          <div className="field-stack">
            <Field id="store-name" label="Store name" value={draft.storeName} onChange={(storeName) => setDraft({ storeName })} />
            <Select id="category" label="Business category" value={draft.category} onChange={(category) => setDraft({ category })} options={["Fashion", "Electronics", "Food & Groceries", "Beauty & Health", "Home & Living", "Sports & Fitness", "Books & Stationery", "Other"]} />
            <Select id="city" label="Supported city" value={draft.city} onChange={(city) => setDraft({ city: city as SupportedCity })} options={[...SUPPORTED_CITIES]} />
            <Area id="description" label="Short business description" value={draft.description} onChange={(description) => setDraft({ description })} rows={4} />
          </div>
          <button className="btn-primary" onClick={next} disabled={!draft.storeName || !draft.category || !draft.city}>Next step →</button>
        </div>
      )}
      {step === 2 && (
        <div className="wizard-card">
          <span className="label">02. Payout account</span>
          <h2>Where should we send your money?</h2>
          <div className="field-stack">
            <Select id="bank" label="Bank name" value={draft.bankName} onChange={(bankName) => setDraft({ bankName })} options={["Kora Demo Bank", "Access Bank", "GTBank", "Zenith Bank", "UBA", "First Bank"]} />
            <Field id="account-number" label="Account number" value={draft.accountNumber} onChange={(accountNumber) => setDraft({ accountNumber: accountNumber.replace(/\D/g, "").slice(0, 10), accountName: accountNumber.length >= 9 ? draft.accountName : "" })} />
            <Field id="account-name" label="Account name" value={draft.accountNumber.length === 10 ? draft.accountName || "Terra Basket Foods" : ""} onChange={(accountName) => setDraft({ accountName })} readOnly={draft.accountNumber.length === 10} />
            {draft.accountNumber.length === 10 ? <StatusBadge>✓ Account verified</StatusBadge> : <span className="label">Enter 10 digits to verify account...</span>}
          </div>
          <button className="btn-primary" onClick={next} disabled={draft.accountNumber.length !== 10}>Next step →</button>
        </div>
      )}
      {step === 3 && (
        <div className="wizard-card" style={{ maxWidth: 960 }}>
          <span className="label">03. Your products</span>
          <h2>Add your first products.</h2>
          <p>You need at least 1 product to continue. Add up to 10 to get started.</p>
          <div className="tab-row">
            <button className={mode === "manual" ? "btn-primary" : "btn-ghost"} onClick={() => setMode("manual")}>Manual entry</button>
            <button className={mode === "bulk" ? "btn-primary" : "btn-ghost"} onClick={() => setMode("bulk")}>Bulk paste</button>
          </div>
          {mode === "bulk" ? (
            <>
              <Area id="bulk" label="Paste products" rows={10} value={draft.productsText} onChange={(productsText) => setDraft({ productsText })} />
              <div className="table">
                {parsedProducts.map((product) => (
                  <div className="table-row" key={product.name}>
                    <strong>{product.name}</strong><span>{money(product.price)}</span><span>{product.description}</span><span>{product.imageUrl || "No image"}</span><span className="chip mint">Valid</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="field-stack">
              {parsedProducts.map((product, index) => (
                <div className="product-entry" key={`${product.name}-${index}`}>
                  <Field id={`p-name-${index}`} label="Product name" value={product.name} onChange={(name) => updateProductRow(index, { name })} />
                  <Field id={`p-price-${index}`} label="Price (NGN)" value={String(product.price)} onChange={(price) => updateProductRow(index, { price: Number(price.replace(/\D/g, "")) || 0 })} />
                  <Field id={`p-desc-${index}`} label="Description" value={product.description || ""} onChange={(description) => updateProductRow(index, { description })} />
                  <div className="field">
                    <label className="field-label" htmlFor={`p-img-${index}`}>Product image</label>
                    <input
                      id={`p-img-${index}`}
                      className="field-input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          attachCloudinaryImage(index, file.name);
                        }
                      }}
                    />
                    <span className="label">{product.imageUrl ? `Stored in Cloudinary bucket: ${product.imageUrl}` : "Upload to Aeris Cloudinary bucket"}</span>
                  </div>
                  <button className="btn-danger" aria-label="Delete product" disabled={parsedProducts.length <= 1} onClick={() => removeProductRow(index)}>x</button>
                </div>
              ))}
              <button className="btn-ghost" onClick={addProductRow} disabled={parsedProducts.length >= 10}>
                + Add product
              </button>
              {parsedProducts.length >= 10 && <span className="label">Maximum 10 products</span>}
            </div>
          )}
          <button className="btn-primary" onClick={next} disabled={parsedProducts.length < 1}>Next step →</button>
        </div>
      )}
      {step === 4 && (
        <div className="wizard-card wizard-wide">
          <div>
            <span className="label">04. Your brand</span>
            <h2>Make it yours.</h2>
            <div className="field-stack">
              <BrandColorPicker color={draft.primary} onChange={(primary) => setDraft({ primary })} />
              <Field id="tagline" label="Store tagline" value={draft.tagline} onChange={(tagline) => setDraft({ tagline: tagline.slice(0, 80) })} />
              <span className="label">{draft.tagline.length} / 80</span>
            </div>
          </div>
          <MiniStorePreview draft={draft} />
          <button className="btn-primary" onClick={next}>Next step →</button>
        </div>
      )}
      {step === 5 && (
        <div className="wizard-card">
          <span className="label">05. Review</span>
          <h2>Ready to generate.</h2>
          <div className="form-card corner-marked">
            <Corners />
            <p><strong>{draft.storeName}</strong> · {draft.category} · {draft.city}</p>
            <p>{draft.bankName} · {draft.accountNumber} · Verified</p>
            <p>{parsedProducts.length} products added</p>
            <p><span style={{ display: "inline-block", width: 20, height: 20, background: draft.primary, verticalAlign: "middle" }} /> {draft.primary}</p>
          </div>
          <button className="btn-primary" style={{ height: 56, fontSize: 18 }} onClick={next}>Generate my store →</button>
        </div>
      )}
    </div>
  );
}

function Field({ id, label, value, onChange, readOnly }: { id: string; label: string; value: string; onChange: (value: string) => void; readOnly?: boolean }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="field-input" value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Area({ id, label, value, onChange, rows }: { id: string; label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <textarea id={id} className="field-input" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Select({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="field-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </div>
  );
}

function BrandColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const rgb = hexToRgb(color);

  function setChannel(channel: "r" | "g" | "b", value: number) {
    onChange(rgbToHex(channel === "r" ? value : rgb.r, channel === "g" ? value : rgb.g, channel === "b" ? value : rgb.b));
  }

  return (
    <div className="color-visualizer">
      <span className="field-label">Primary brand color</span>
      <div className="swatch-row" aria-label="Preset brand colors">
        {COLOR_PRESETS.map(([name, preset]) => (
          <button
            aria-label={`Use ${name}`}
            className={`color-swatch ${preset.toUpperCase() === color.toUpperCase() ? "selected" : ""}`}
            key={preset}
            onClick={() => onChange(preset)}
            style={{ background: preset }}
            type="button"
          />
        ))}
      </div>
      <div className="color-picker-grid">
        <label className="color-preview" htmlFor="primary-color" style={{ background: color }}>
          <span>{color}</span>
        </label>
        <input id="primary-color" className="field-input" type="color" value={color} onChange={(event) => onChange(event.target.value.toUpperCase())} />
      </div>
      <div className="rgb-grid">
        {(["r", "g", "b"] as const).map((channel) => (
          <label className="field" key={channel}>
            <span className="field-label">{channel.toUpperCase()}</span>
            <input
              className="field-input"
              max={255}
              min={0}
              type="range"
              value={rgb[channel]}
              onChange={(event) => setChannel(channel, Number(event.target.value))}
            />
            <span className="label">{rgb[channel]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function MiniStorePreview({ draft }: { draft: Draft }) {
  return (
    <div className="store-card" style={{ padding: 24 }}>
      <span className="label">Live preview</span>
      <h3>{draft.storeName}</h3>
      <p>{draft.tagline}</p>
      <button className="btn-primary" style={{ background: draft.primary, borderColor: draft.primary }}>Shop now →</button>
    </div>
  );
}

function Generating({ go }: CommonProps) {
  const lines = ["ANALYSING BUSINESS DETAILS", "GENERATING STORE THEME CONFIGURATION", "CRAFTING HOMEPAGE LAYOUT", "WRITING PRODUCT DESCRIPTIONS", "FINALISING STOREFRONT CONTENT", "STORE READY FOR PREVIEW"];
  return (
    <main className="wizard-shell" style={{ display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div className="wireframe-box" style={{ width: 450, maxWidth: "80vw", margin: "0 auto 32px" }}>
          <div className="orbit" /><span className="orbit-node one" /><span className="orbit-node two" /><span className="orbit-node three" />
          <span style={{ position: "absolute", inset: "calc(50% - 8px)", width: 16, height: 16, background: "var(--color-mint)" }} />
        </div>
        <div style={{ display: "grid", gap: 12, textAlign: "left" }}>
          {lines.map((line, index) => <span className="mono" style={{ fontSize: 11 }} key={line}>■ 00:{String(index * 2 + 1).padStart(2, "0")} {line}</span>)}
        </div>
        <button className="btn-primary" style={{ marginTop: 32 }} onClick={() => go("/onboarding/preview")}>Preview your store →</button>
      </div>
    </main>
  );
}

function Preview({ state, update, go, notify }: CommonProps) {
  const products = state.store.products.filter((product) => !product.deleted);
  return (
    <div className="preview-shell">
      <aside className="preview-sidebar">
        <StatusBadge>Preview mode</StatusBadge>
        <p className="mono" style={{ fontSize: 11, marginTop: 16 }}>AI draft — not yet published</p>
        <hr />
        <h3>Store info</h3>
        <Field id="preview-name" label="Store name" value={state.store.name} onChange={(name) => update((current) => ({ ...current, store: { ...current.store, name } }))} />
        <Area id="ai" label="AI refinement" rows={4} value="Make the homepage warmer and emphasize delivery speed." onChange={() => undefined} />
        <button className="btn-primary" style={{ width: "100%" }} onClick={() => notify("Proposed AI changes ready for review")}>Apply changes</button>
        <button className="btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => notify("Changes discarded")}>Discard</button>
      </aside>
      <main className="preview-main">
        <span className="preview-badge status-badge"><span className="status-dot" />Preview draft</span>
        <StorefrontRenderer store={state.store} products={products} cart={state.cart} addToCart={() => undefined} preview />
        <div className="bottom-bar">
          <button className="btn-ghost" onClick={() => go("/onboarding")}>← Back to editor</button>
          <button className="btn-primary" onClick={() => go("/claim")}>Claim & publish →</button>
        </div>
      </main>
    </div>
  );
}

function Claim({ state, update, go }: CommonProps) {
  const [email, setEmail] = useState("merchant@aeris.store");
  const [password, setPassword] = useState("password123");
  const [slug, setSlug] = useState(state.store.slug);
  const available = isSlugAvailable(slug, state.store.slug);

  function regenerateSlug() {
    const suffix = Math.random().toString(36).slice(2, 6);
    setSlug(`${slugify(state.store.name)}-${suffix}`);
  }

  return (
    <main className="wizard-shell" style={{ display: "grid", placeItems: "center" }}>
      <div className="form-card corner-marked" style={{ width: "min(480px, calc(100% - 32px))" }}>
        <Corners />
        <h2>Claim your store.</h2>
        <p>Create an account to own this draft and publish it to your Aeris subdomain.</p>
        <div className="field-stack">
          <Field id="claim-email" label="Email address" value={email} onChange={setEmail} />
          <Field id="claim-password" label="Choose a password" value={password} onChange={setPassword} />
          <div className="slug-row">
            <Field id="claim-slug" label="Store slug" value={slug} onChange={(value) => setSlug(slugify(value))} />
            <button className="btn-ghost" onClick={regenerateSlug} type="button">Regenerate</button>
          </div>
          <span className="mono" style={{ fontSize: 11, color: available ? "var(--color-forest)" : "var(--color-coral)" }}>
            Your store will live at: {slug || "your-slug"}.aeris.store · {available ? "✓ Available" : "✕ Already reserved or too short"}
          </span>
        </div>
        <button className="btn-primary" disabled={!available} style={{ width: "100%", height: 56, marginTop: 24 }} onClick={() => {
          update((current) => ({ ...current, store: { ...current.store, slug, ownerEmail: email, published: true }, activity: [`Published ${slug}.aeris.store`, ...current.activity] }));
          go("/store");
        }}>Create account & publish</button>
      </div>
    </main>
  );
}

function Dashboard({ state, update, go, notify, section }: CommonProps & { section: "store" | "products" | "orders" | "payouts" | "settings" }) {
  const visibleProducts = state.store.products.filter((product) => !product.deleted);
  const balance = availableBalance(state.orders, state.payouts);
  return (
    <>
      <BrandNav state={state} update={update} go={go} />
      <div className="dashboard-layout">
        <main className="dashboard-main">
          {section === "store" && <StoreOverview state={state} go={go} balance={balance} />}
          {section === "products" && <ProductsManager state={state} update={update} notify={notify} products={visibleProducts} />}
          {section === "orders" && <OrdersManager state={state} update={update} />}
          {section === "payouts" && <PayoutsManager state={state} update={update} balance={balance} />}
          {section === "settings" && <SettingsManager state={state} update={update} />}
        </main>
        <aside className="dashboard-sidebar">
          <div className="side-box">
            <span className="label">Live store URL</span>
            <p className="mono" style={{ fontSize: 11, color: "var(--color-forest)" }}>{state.store.slug}.aeris.store</p>
            <button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>View live store ↗</button>
          </div>
          <div className="side-box" style={{ marginTop: 16 }}>
            <span className="label">Merchant balance</span>
            <span className="stat-number" style={{ fontSize: 32 }}>{money(balance)}</span>
            <button className="btn-primary" style={{ width: "100%" }} onClick={() => go("/payouts")}>Request payout →</button>
          </div>
        </aside>
      </div>
    </>
  );
}

function StoreOverview({ state, go, balance }: { state: State; go: (path: string) => void; balance: number }) {
  const [livePrompt, setLivePrompt] = useState("Refresh the hero copy and make the storefront feel more premium.");

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card accent-mint"><span className="label">Store status</span><span className="stat-number">{state.store.published ? "LIVE" : "DRAFT"}</span></div>
        <div className="stat-card accent-gold"><span className="label">Active products</span><span className="stat-number">{state.store.products.filter((p) => !p.deleted).length}</span></div>
        <div className="stat-card accent-coral"><span className="label">Available</span><span className="stat-number">{money(balance)}</span></div>
      </div>
      <h2>Store overview</h2>
      <p>Your storefront is published at <strong>{state.store.slug}.aeris.store</strong>. Manage products, orders, payouts, and settings from the navigation above.</p>
      <div className="row"><button className="btn-primary" onClick={() => go("/products")}>Add product +</button><button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>View storefront ↗</button></div>
      <div className="two-column" style={{ marginTop: 32 }}>
        <div className="form-card corner-marked">
          <Corners />
          <span className="label">Live store AI editor</span>
          <h3>Prompt AI to change the live storefront</h3>
          <p>Use this after publishing to rewrite copy, improve merchandising, or generate a better hero direction for the live store.</p>
          <Area id="live-ai" label="Prompt" rows={5} value={livePrompt} onChange={setLivePrompt} />
          <button
            className="btn-primary"
            onClick={() => {
              const generatedImage = livePrompt.toLowerCase().includes("background") || livePrompt.toLowerCase().includes("hero")
                ? `https://images.aeris.store/generated/${slugify(state.store.name)}-hero.jpg`
                : state.store.heroImageUrl || "";
              localStorage.setItem(
                "aeris-product-state",
                JSON.stringify({
                  ...state,
                  store: {
                    ...state.store,
                    heroTitle: `${state.store.name.toUpperCase()} REIMAGINED.`,
                    heroCopy: `AI update: ${livePrompt}`,
                    heroImageUrl: generatedImage
                  },
                  activity: [`AI updated live store: ${livePrompt}`, ...state.activity]
                })
              );
              window.location.href = "/store";
            }}
          >
            Apply to live store
          </button>
        </div>
        <div className="form-card corner-marked">
          <Corners />
          <span className="label">Brand assets</span>
          <h3>Logo and hero image</h3>
          <p>Set the logo shown in the storefront nav and the background art used behind the hero.</p>
          <div className="row" style={{ alignItems: "flex-start", marginBottom: 16 }}>
            {state.store.logoUrl ? <div className="logo-preview" style={{ backgroundImage: `url(${state.store.logoUrl})` }} /> : <div className="logo-preview logo-preview-empty">LOGO</div>}
            {state.store.heroImageUrl ? <div className="hero-preview-thumb" style={{ backgroundImage: `url(${state.store.heroImageUrl})` }} /> : <div className="hero-preview-thumb logo-preview-empty">HERO</div>}
          </div>
          <div className="row">
            <button className="btn-ghost" onClick={() => go("/settings")}>Edit store assets</button>
            <button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>Preview live storefront</button>
          </div>
        </div>
      </div>
    </>
  );
}

function ProductsManager({ state, update, notify, products }: { state: State; update: CommonProps["update"]; notify: (m: string) => void; products: Product[] }) {
  function patchProduct(id: string, patch: Partial<Product>) {
    update((current) => ({ ...current, store: { ...current.store, products: current.store.products.map((product) => product.id === id ? { ...product, ...patch, source: patch.name || patch.description || patch.price ? "merchant" : product.source } : product) } }));
  }
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}><h2>Products</h2><button className="btn-primary" onClick={() => {
        update((current) => ({ ...current, store: { ...current.store, products: [...current.store.products, makeProduct({ name: "New Product", price: 5000, description: "Edit this product from your dashboard." }, current.store.products.length)] } }));
        notify("Product created");
      }}>Add product +</button></div>
      <div className="table">
        {products.map((product) => (
          <div className="table-row" key={product.id}>
            <strong>{product.name}<br /><span className="label">{product.slug}</span></strong>
            <span>{money(product.price)}</span>
            <span className={`chip ${product.source === "ai" ? "gold" : product.inStock ? "mint" : "coral"}`}>{product.source === "ai" ? "⚡ AI Draft" : product.inStock ? "In stock" : "Out of stock"}</span>
            <button className="btn-ghost" onClick={() => patchProduct(product.id, { inStock: !product.inStock })}>{product.inStock ? "Mark out" : "Restock"}</button>
            <button className="btn-danger" onClick={() => patchProduct(product.id, { deleted: true, featured: false })}>Delete</button>
          </div>
        ))}
      </div>
    </>
  );
}

function OrdersManager({ state, update }: { state: State; update: CommonProps["update"] }) {
  function move(order: Order, status: OrderStatus) {
    if (!canTransitionOrder(order.status, status)) return;
    update((current) => ({ ...current, orders: current.orders.map((candidate) => candidate.id === order.id ? { ...candidate, status } : candidate) }));
  }
  return (
    <>
      <h2>Orders</h2>
      {state.orders.length === 0 ? <div className="empty-state"><p>No paid orders yet. Complete customer checkout from the storefront.</p></div> : (
        <div className="table">
          {state.orders.map((order) => (
            <div className="table-row" key={order.id}>
              <strong>{order.reference}</strong><span>{order.delivery.fullName}</span><span>{money(order.subtotal + order.logisticsFee)}</span><span className="chip mint">{order.status}</span>
              <button className="btn-ghost" disabled={!canTransitionOrder(order.status, "processing")} onClick={() => move(order, "processing")}>Processing</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PayoutsManager({ state, update, balance }: { state: State; update: CommonProps["update"]; balance: number }) {
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}><h2>Payouts</h2><strong className="stat-number" style={{ fontSize: 24 }}>{money(balance)}</strong></div>
      <div className="form-card corner-marked" style={{ maxWidth: 480 }}><Corners /><span className="label">Payout amount</span><p>Max available: {money(balance)}</p><button className="btn-primary" disabled={balance <= 0} onClick={() => {
        const amount = Math.floor(balance * 0.75);
        const orders = structuredClone(state.orders);
        const allocation = allocatePayout(amount, orders);
        update((current) => ({ ...current, orders, payouts: [{ id: cryptoId("payout"), amount: amount - allocation.remaining, status: "requested", allocatedOrderRefs: allocation.refs, createdAt: new Date().toISOString() }, ...current.payouts] }));
      }}>Request payout →</button></div>
      <div className="table" style={{ marginTop: 24 }}>{state.payouts.map((payout) => <div className="table-row" key={payout.id}><span>{payout.createdAt.slice(0, 10)}</span><strong>{money(payout.amount)}</strong><span>{state.draft.bankName}</span><span className="chip gold">{payout.status}</span><span>{payout.id}</span></div>)}</div>
    </>
  );
}

function SettingsManager({ state, update }: { state: State; update: CommonProps["update"] }) {
  return (
    <>
      <h2>Settings</h2>
      <div className="field-stack" style={{ maxWidth: 720 }}>
        <Field id="settings-name" label="Store name" value={state.store.name} onChange={(name) => update((current) => ({ ...current, store: { ...current.store, name } }))} />
        <Field id="settings-tagline" label="Tagline" value={state.store.heroCopy} onChange={(heroCopy) => update((current) => ({ ...current, store: { ...current.store, heroCopy } }))} />
        <Field id="settings-logo" label="Logo URL" value={state.store.logoUrl || ""} onChange={(logoUrl) => update((current) => ({ ...current, draft: { ...current.draft, logoUrl }, store: { ...current.store, logoUrl } }))} />
        <Field id="settings-hero-image" label="Hero background image URL" value={state.store.heroImageUrl || ""} onChange={(heroImageUrl) => update((current) => ({ ...current, draft: { ...current.draft, heroImageUrl }, store: { ...current.store, heroImageUrl } }))} />
        <div className="row" style={{ alignItems: "flex-start" }}>
          {state.store.logoUrl ? <div className="logo-preview" style={{ backgroundImage: `url(${state.store.logoUrl})` }} /> : <div className="logo-preview logo-preview-empty">LOGO</div>}
          {state.store.heroImageUrl ? <div className="hero-preview-thumb" style={{ backgroundImage: `url(${state.store.heroImageUrl})` }} /> : <div className="hero-preview-thumb logo-preview-empty">HERO</div>}
        </div>
        <p className="mono" style={{ color: "var(--color-gold)", fontSize: 10 }}>⚠ Slug is locked after publish and cannot be changed.</p>
      </div>
    </>
  );
}

function PublicStore({ state, update, go, notify }: CommonProps) {
  const products = state.store.products.filter((product) => !product.deleted);
  function add(product: Product) {
    update((current) => {
      const existing = current.cart.find((line) => line.productId === product.id);
      const cart = existing ? current.cart.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line) : [...current.cart, { productId: product.id, quantity: 1 }];
      return { ...current, cart };
    });
    notify("Added to cart");
  }
  return <StorefrontRenderer store={state.store} products={products} cart={state.cart} addToCart={add} go={go} />;
}

function StorefrontRenderer({ store, products, cart, addToCart, go, preview }: { store: Store; products: Product[]; cart: CartLine[]; addToCart: (product: Product) => void; go?: (path: string) => void; preview?: boolean }) {
  const [searchQuery, setSearchQuery] = useState("");
  const featured = products.filter((product) => product.featured && product.source === "merchant" && product.inStock).slice(0, 4);
  const filteredProducts = products.filter((product) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return product.name.toLowerCase().includes(query) || (product.description || "").toLowerCase().includes(query);
  });
  if (!preview && !store.published) {
    return <main className="storefront-page store-hero"><div><h2>{store.name}</h2><StatusBadge>Temporarily unavailable</StatusBadge><p>This store is currently unavailable. Please check back soon.</p><span className="label">Powered by Aeris</span></div></main>;
  }
  return (
    <main className="storefront-page" style={{ "--store-primary": store.theme.primary } as CSSProperties}>
      <nav className="store-nav">
        <div className="store-brand">
          {store.logoUrl ? <div className="store-logo" style={{ backgroundImage: `url(${store.logoUrl})` }} /> : null}
          <strong style={{ fontFamily: "var(--font-display)", color: "var(--color-forest)" }}>{store.name}</strong>
        </div>
        <div className="row">
          <input className="store-search-input" aria-label="Search products" placeholder="Search products" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          <button className="btn-ghost" onClick={() => go?.("/cart")}>Cart <span className="cart-pill">{cart.reduce((sum, line) => sum + line.quantity, 0)}</span></button>
        </div>
      </nav>
      <section className="store-hero" style={store.heroImageUrl ? { backgroundImage: `linear-gradient(rgba(247,247,245,0.78), rgba(247,247,245,0.78)), url(${store.heroImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        <div className="store-hero-inner">
          <h1>{store.name.toUpperCase()}</h1>
          <p className="mono">{store.heroCopy}</p>
          <button className="btn-primary" onClick={() => document.getElementById("store-products")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Shop now →</button>
        </div>
      </section>
      <section className="section-block"><div className="container"><span className="label">Featured</span><h2>Hand-picked for you.</h2><div className="store-product-grid">{(featured.length ? featured : products).map((product) => <StoreProductCard key={product.id} product={product} addToCart={addToCart} />)}</div></div></section>
      <section className="section-block" id="store-products"><div className="container"><span className="label">All products</span><h2>The collection.</h2><div className="store-product-grid">{filteredProducts.map((product) => <StoreProductCard key={`${product.id}-all`} product={product} addToCart={addToCart} />)}</div></div></section>
      <footer className="section-block"><div className="container row" style={{ justifyContent: "space-between" }}><span>{store.name} · {store.city} · {store.category}</span><span className="label">Powered by Aeris</span></div></footer>
    </main>
  );
}

function StoreProductCard({ product, addToCart }: { product: Product; addToCart: (product: Product) => void }) {
  return (
    <article className="product-card">
      <div className="product-image">{product.name}</div>
      <div className="product-body">
        {product.source === "ai" && <span className="chip gold">⚡ AI Draft</span>}
        {!product.inStock && <span className="chip coral">Out of stock</span>}
        <strong>{product.name}</strong>
        <p>{product.description}</p>
        <h3>{money(product.price)}</h3>
        <button className="btn-ghost" disabled={!product.inStock} onClick={() => addToCart(product)}>{product.inStock ? "Add to cart" : "Out of stock"}</button>
      </div>
    </article>
  );
}

function CartPage({ state, go }: CommonProps) {
  const products = state.cart.map((line) => ({ line, product: state.store.products.find((product) => product.id === line.productId) })).filter((entry) => entry.product);
  const totals = calculateCheckout(state.store.products, state.cart, state.store.city);
  return (
    <>
      <StoreUtilityNav store={state.store} cartCount={state.cart.reduce((sum, line) => sum + line.quantity, 0)} go={go} />
      <main className="container section-block page-with-store-nav">
        <button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>← Continue shopping</button>
        <h2 style={{ marginTop: 32 }}>Your cart</h2>
        {products.length === 0 ? <div className="empty-state"><button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>Continue shopping →</button></div> : <CartContents state={state} go={go} totals={totals} />}
    </main>
    </>
  );
}

function CartContents({ state, go, totals }: { state: State; go: (path: string) => void; totals: ReturnType<typeof calculateCheckout> }) {
  function mutateCart(productId: string, nextQuantity: number) {
    const saved = localStorage.getItem("aeris-product-state");
    if (!saved) {
      return;
    }

    const current = JSON.parse(saved) as State;
    const cart = nextQuantity <= 0
      ? current.cart.filter((line) => line.productId !== productId)
      : current.cart.map((line) => line.productId === productId ? { ...line, quantity: nextQuantity } : line);
    localStorage.setItem("aeris-product-state", JSON.stringify({ ...current, cart }));
    window.location.href = "/cart";
  }

  const products = state.cart
    .map((line) => ({ line, product: state.store.products.find((product) => product.id === line.productId) }))
    .filter((entry) => entry.product);

  return (
    <div className="two-column">
      <div className="table">
        {products.map(({ line, product }) => (
          <div className="table-row cart-table-row" key={line.productId}>
            <strong>{product?.name}</strong>
            <span>{money(product?.price || 0)}</span>
            <div className="qty-controls">
              <button className="btn-ghost qty-button" onClick={() => mutateCart(line.productId, line.quantity - 1)}>-</button>
              <span>Qty {line.quantity}</span>
              <button className="btn-ghost qty-button" onClick={() => mutateCart(line.productId, line.quantity + 1)}>+</button>
            </div>
            <span>{money((product?.price || 0) * line.quantity)}</span>
            <button className="btn-danger" onClick={() => mutateCart(line.productId, 0)}>Remove</button>
          </div>
        ))}
      </div>
      <div className="form-card corner-marked"><Corners /><span className="label">Order summary</span><p>Subtotal: {money(totals.subtotal)}</p><p>Logistics: {money(totals.logisticsFee)}</p><h3>Total: {money(totals.total)}</h3><button className="btn-primary" onClick={() => go("/checkout")}>Proceed to checkout →</button></div>
    </div>
  );
}

function CheckoutPage({ state, update, go, notify }: CommonProps) {
  const [details, setDetails] = useState<CheckoutDetails>({ fullName: "Ada Okonkwo", phone: "08012345678", address: "14 Admiralty Way", landmark: "Near pharmacy", city: state.store.city });
  const totals = calculateCheckout(state.store.products, state.cart, details.city);
  return (
    <>
      <StoreUtilityNav store={state.store} cartCount={state.cart.reduce((sum, line) => sum + line.quantity, 0)} go={go} />
      <main className="container section-block two-column page-with-store-nav">
        <div className="form-card corner-marked"><Corners /><button className="btn-ghost" onClick={() => go("/cart")}>← Back to cart</button><h2 style={{ marginTop: 24 }}>Checkout</h2><Field id="full-name" label="Full name" value={details.fullName} onChange={(fullName) => setDetails({ ...details, fullName })} /><Field id="phone" label="Phone number" value={details.phone} onChange={(phone) => setDetails({ ...details, phone })} /><Select id="delivery-city" label="Delivery city" value={details.city} onChange={(city) => setDetails({ ...details, city: city as SupportedCity })} options={[...SUPPORTED_CITIES]} /><Field id="address" label="Address line" value={details.address} onChange={(address) => setDetails({ ...details, address })} /><button className="btn-primary" style={{ width: "100%", height: 56, marginTop: 16 }} onClick={() => {
        if (!isSupportedCity(details.city)) return;
        const items = state.cart.map((line) => {
          const product = state.store.products.find((candidate) => candidate.id === line.productId)!;
          return { productId: product.id, name: product.name, quantity: line.quantity, unitPrice: product.price };
        });
        const order: Order = { id: cryptoId("order"), reference: `AERIS_${Date.now().toString(36).toUpperCase()}`, storeId: state.store.id, items, subtotal: totals.subtotal, logisticsFee: totals.logisticsFee, platformFee: totals.platformFee, merchantEarnings: totals.merchantEarnings, status: "paid", paymentState: "paid", delivery: details, createdAt: new Date().toISOString(), payoutAllocated: 0 };
        update((current) => ({ ...current, cart: [], orders: [order, ...current.orders], activity: [`New paid order ${order.reference}`, ...current.activity] }));
        notify("■ New order paid through Kora");
        go(`/order/${order.reference}?success=1`);
      }}>Proceed to payment →</button></div>
      <aside className="form-card"><span className="label">Order summary</span><p>Subtotal: {money(totals.subtotal)}</p><p>Delivery: {money(totals.logisticsFee)}</p><h3>Total: {money(totals.total)}</h3></aside>
    </main>
    </>
  );
}

function OrderStatus({ state, go }: CommonProps) {
  const pathname = usePathname();
  const ref = pathname.split("/").pop();
  const order = state.orders.find((candidate) => candidate.reference === ref);
  return (
    <>
      <StoreUtilityNav store={state.store} cartCount={state.cart.reduce((sum, line) => sum + line.quantity, 0)} go={go} />
      <main className="container section-block page-with-store-nav">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 32 }}>
          <button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>← Back to store</button>
        </div>
        {order ? <><StatusBadge>Payment confirmed</StatusBadge><h2>Order status</h2><p className="mono">#{order.reference}</p><div className="form-card"><h3>{order.status.toUpperCase()}</h3><p>Delivery to {order.delivery.fullName}, {order.delivery.address}, {order.delivery.city}.</p></div></> : <div className="empty-state">Order not found.</div>}
      </main>
    </>
  );
}

function StoreUtilityNav({ store, cartCount, go }: { store: Store; cartCount: number; go: (path: string) => void }) {
  return (
    <nav className="store-nav utility-nav">
      <button className="nav-link" onClick={() => go(`/s/${store.slug}`)}>← Storefront</button>
      <strong style={{ fontFamily: "var(--font-display)", color: "var(--color-forest)" }}>{store.name}</strong>
      <button className="btn-ghost" onClick={() => go("/cart")}>Cart <span className="cart-pill">{cartCount}</span></button>
    </nav>
  );
}
