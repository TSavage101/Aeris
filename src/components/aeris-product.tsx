"use client";

import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties, InputHTMLAttributes } from "react";
import type { CartLine, CheckoutDetails, Order, OrderStatus, PayoutRequest, Product, ProductSource, Store, SupportedCity } from "@/lib/aeris";
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
  leadEmail: string;
  storeName: string;
  category: string;
  city: SupportedCity | "";
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

type DraftProductRow = {
  name: string;
  price: string;
  description: string;
  imageUrl: string;
};

type State = {
  draft: Draft;
  store: Store;
  orders: Order[];
  payouts: PayoutRequest[];
  cart: CartLine[];
  activity: string[];
  auth: {
    email: string;
    password: string;
    loggedIn: boolean;
  };
};

const defaultDraft: Draft = {
  leadEmail: "",
  storeName: "",
  category: "",
  city: "",
  description: "",
  bankName: "",
  accountNumber: "",
  accountName: "",
  primary: "#1A3C2B",
  tagline: "",
  logoUrl: "",
  heroImageUrl: "",
  productsText: ""
};

function buildStore(draft: Draft): Store {
  const merchantProducts = parseProductsBulk(draft.productsText).map((product, index) => makeProduct(product, index));
  const products = merchantProducts.length
    ? [...merchantProducts, ...generateAiProducts(draft.category, Math.max(0, 3 - merchantProducts.length), merchantProducts.length)]
    : generateAiProducts(draft.category || "General", 3, 0);
  const storeName = draft.storeName.trim() || "Aeris Store";
  const category = draft.category || "General";
  const city = draft.city || "Lagos";

  return {
    id: cryptoId("store"),
    slug: slugify(storeName),
    name: storeName,
    city,
    category,
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
    heroTitle: `${storeName.toUpperCase()} DELIVERED FAST.`,
    heroCopy: draft.tagline.trim() || `Discover curated ${category.toLowerCase()} offers built for shoppers in ${city}.`,
    products
  };
}

const initialState: State = {
  draft: defaultDraft,
  store: buildStore(defaultDraft),
  orders: [],
  payouts: [],
  cart: [],
  activity: ["Draft storefront prepared from merchant details"],
  auth: {
    email: "",
    password: "",
    loggedIn: false
  }
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

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function onboardingSeed(category: string) {
  return generateAiProducts(category || "General", 2, 0).map((product) => ({
    name: product.name,
    price: product.price,
    description: product.description || "",
    imageUrl: product.imageUrl || ""
  }));
}

function parseDraftProductRows(text: string): DraftProductRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const [name = "", price = "", description = "", imageUrl = ""] = line.split("|").map((part) => part.trim());

      return {
        name,
        price,
        description,
        imageUrl
      };
    })
    .filter((row) => row.name || row.price || row.description || row.imageUrl);
}

function serializeDraftProductRows(rows: DraftProductRow[]) {
  return rows.map((row) => `${row.name} | ${row.price} | ${row.description} | ${row.imageUrl}`).join("\n");
}

function sanitizePriceInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...fractionParts] = cleaned.split(".");
  const fraction = fractionParts.join("").slice(0, 2);
  return fractionParts.length ? `${whole}.${fraction}` : whole;
}

function normalizePriceInput(value: string) {
  if (!value.trim()) {
    return "";
  }

  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "";
  }

  return numeric.toFixed(2);
}

function draftRowsToProducts(rows: DraftProductRow[]) {
  return rows
    .map((row) => ({
      name: row.name.trim(),
      price: Number.parseFloat(row.price),
      description: row.description.trim(),
      imageUrl: row.imageUrl.trim()
    }))
    .filter((product) => product.name.length > 0 && Number.isFinite(product.price) && product.price > 0);
}

function seedRows(category: string) {
  return onboardingSeed(category).map((product) => ({
    name: product.name,
    price: product.price.toFixed(2),
    description: product.description || "",
    imageUrl: product.imageUrl || ""
  }));
}

function resetDraftState(leadEmail = ""): Draft {
  return {
    ...defaultDraft,
    leadEmail
  };
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16) || 0,
    g: Number.parseInt(normalized.slice(2, 4), 16) || 0,
    b: Number.parseInt(normalized.slice(4, 6), 16) || 0
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function normalizeState(saved: Partial<State>): State {
  return {
    ...initialState,
    ...saved,
    draft: {
      ...initialState.draft,
      ...(saved.draft || {})
    },
    store: {
      ...initialState.store,
      ...(saved.store || {}),
      theme: {
        ...initialState.store.theme,
        ...(saved.store?.theme || {})
      },
      products: saved.store?.products || initialState.store.products
    },
    orders: saved.orders || initialState.orders,
    payouts: saved.payouts || initialState.payouts,
    cart: saved.cart || initialState.cart,
    activity: saved.activity || initialState.activity,
    auth: {
      ...initialState.auth,
      ...(saved.auth || {})
    }
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function isSlugAvailable(slug: string, currentSlug?: string) {
  return slug.length >= 3 && (slug === currentSlug || !RESERVED_SLUGS.has(slug));
}

function slugFieldState(slug: string, currentSlug?: string) {
  if (!slug.trim()) {
    return { available: false, invalid: false, message: "Enter a store slug" };
  }
  if (slug.length < 3) {
    return { available: false, invalid: true, message: "Slug must be at least 3 characters" };
  }
  if (slug === currentSlug) {
    return { available: true, invalid: false, message: "Available" };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { available: false, invalid: true, message: "This slug is already taken" };
  }
  return { available: true, invalid: false, message: "Available" };
}

function isEmailTaken(state: State, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [state.auth.email, state.store.ownerEmail]
    .filter(Boolean)
    .some((candidate) => candidate?.trim().toLowerCase() === normalized);
}

function persistState(nextState: State) {
  localStorage.setItem("aeris-product-state", JSON.stringify(nextState));
}

function ChainBrainIcon() {
  return (
    <svg aria-hidden="true" className="chain-svg" viewBox="0 0 20 20" fill="none">
      <path d="M7.5 4.5C5.29 4.5 3.5 6.29 3.5 8.5C3.5 9.77 4.09 10.91 5 11.64V13.5C5 14.6 5.9 15.5 7 15.5H8M12.5 4.5C14.71 4.5 16.5 6.29 16.5 8.5C16.5 9.77 15.91 10.91 15 11.64V13.5C15 14.6 14.1 15.5 13 15.5H12M8 15.5H12M10 3V17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
    </svg>
  );
}

function ChainChevronIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={`chain-svg chain-chevron ${open ? "open" : ""}`} viewBox="0 0 20 20" fill="none">
      <path d="M5 8L10 13L15 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
    </svg>
  );
}

function StepIcon({ status }: { status: ThoughtStepStatus }) {
  if (status === "completed") {
    return (
      <svg aria-hidden="true" className="chain-svg" viewBox="0 0 20 20" fill="none">
        <path d="M4 10L8 14L16 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
      </svg>
    );
  }

  if (status === "active") {
    return (
      <svg aria-hidden="true" className="chain-svg" viewBox="0 0 20 20" fill="none">
        <path d="M10 3V10L14.5 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
        <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }

  if (status === "error") {
    return (
      <svg aria-hidden="true" className="chain-svg" viewBox="0 0 20 20" fill="none">
        <path d="M6 6L14 14M14 6L6 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="chain-svg" viewBox="0 0 20 20" fill="none">
      <rect x="5" y="5" width="10" height="10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function AerisProduct() {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<State>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");
  const merchantPaths = ["/dashboard", "/store", "/store/editor", "/products", "/products/new", "/orders", "/payouts", "/settings"];
  const isMerchantPath = merchantPaths.includes(pathname) || (pathname.startsWith("/products/") && pathname !== "/products" && pathname !== "/products/new");

  useEffect(() => {
    const saved = localStorage.getItem("aeris-product-state");
    if (saved) {
      setState(normalizeState(JSON.parse(saved) as Partial<State>));
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem("aeris-product-state", JSON.stringify(state));
    }
  }, [hydrated, state]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (isMerchantPath && !state.auth?.loggedIn) {
      router.replace("/login");
    }
  }, [hydrated, isMerchantPath, pathname, router, state.auth?.loggedIn]);

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
      {pathname === "/login" && <Login {...common} />}
      {state.auth?.loggedIn && ["/dashboard", "/store"].includes(pathname) && <Dashboard {...common} section="store" />}
      {state.auth?.loggedIn && pathname === "/store/editor" && <Dashboard {...common} section="editor" />}
      {state.auth?.loggedIn && pathname === "/products" && <Dashboard {...common} section="products" />}
      {state.auth?.loggedIn && pathname === "/products/new" && <ProductEditorPage {...common} mode="create" />}
      {state.auth?.loggedIn && pathname.startsWith("/products/") && pathname !== "/products" && pathname !== "/products/new" && <ProductEditorPage {...common} mode="edit" />}
      {state.auth?.loggedIn && pathname === "/orders" && <Dashboard {...common} section="orders" />}
      {state.auth?.loggedIn && pathname === "/payouts" && <Dashboard {...common} section="payouts" />}
      {state.auth?.loggedIn && pathname === "/settings" && <Dashboard {...common} section="settings" />}
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

  function openStorefront() {
    window.open(`/s/${state.store.slug}`, "_blank", "noopener,noreferrer");
  }

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
        <button className="btn-ghost" onClick={openStorefront}>
          View store
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
            <div className="mobile-drawer-nav">
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
              <button className="nav-link" onClick={() => {
                setDrawerOpen(false);
                openStorefront();
              }}>View store</button>
            </div>
          </aside>
        </>
      )}
    </header>
  );
}

function Landing({ state, update, go, notify }: CommonProps) {
  const [email, setEmail] = useState(state.draft.leadEmail);
  const emailTaken = isEmailTaken(state, email);
  const invalidEmail = email.trim().length > 0 && !emailLooksValid(email);

  function quickStartOnboarding() {
    const nextDraft = resetDraftState();
    update((current) => ({
      ...current,
      draft: nextDraft,
      store: buildStore(nextDraft)
    }));
    go("/onboarding");
  }

  function startLeadOnboarding() {
    if (!emailLooksValid(email)) {
      notify("Enter a valid email address");
      return;
    }

    if (emailTaken) {
      notify("That email is already attached to a merchant account");
      return;
    }

    const nextDraft = resetDraftState(email.trim().toLowerCase());
    update((current) => ({
      ...current,
      draft: nextDraft,
      store: buildStore(nextDraft)
    }));
    go("/onboarding");
  }

  return (
    <>
      <section className="container landing-hero">
        <div>
          <StatusBadge>AERIS MVP - AFRICAN COMMERCE INFRASTRUCTURE</StatusBadge>
          <h1 className="hero-lines">
            <span>LAUNCH YOUR</span>
            <span>STORE IN</span>
            <span>MINUTES.</span>
          </h1>
          <div className="subtext-rail">AI-powered storefronts. Real payments. Built for African merchants.</div>
          <div className="row">
            <button className="btn-primary" onClick={quickStartOnboarding}>
              Start building
            </button>
            <button className="btn-ghost" onClick={() => go("/s/terra-basket")}>
              View demo
            </button>
            <button className="btn-ghost" onClick={() => go("/login")}>
              Merchant login
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
              <div>NGN 45,500 TOTAL</div>
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
              <input id="landing-email" className={`field-input ${invalidEmail || emailTaken ? "field-error" : ""}`} placeholder="merchant@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            {invalidEmail ? <span className="label form-error">X Enter a valid email address</span> : null}
            {emailTaken ? <span className="label form-error">X This email is already in use</span> : null}
            <button className="btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={startLeadOnboarding} disabled={!emailLooksValid(email) || emailTaken}>
              Start building
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
  const draftRows = useMemo(() => parseDraftProductRows(draft.productsText), [draft.productsText]);
  const parsedProducts = useMemo(() => draftRowsToProducts(draftRows), [draftRows]);
  const progress = (step / 5) * 100;

  function setDraft(patch: Partial<Draft>) {
    update((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  }

  function setDraftRows(rows: DraftProductRow[]) {
    setDraft({ productsText: serializeDraftProductRows(rows) });
  }

  function updateProductRow(index: number, patch: Partial<DraftProductRow>) {
    const rows = draftRows.map((row) => ({ ...row }));
    rows[index] = { ...rows[index], ...patch };
    setDraftRows(rows);
  }

  function addProductRow() {
    if (draftRows.length >= 10) {
      return;
    }

    setDraftRows([...draftRows, { name: "", price: "", description: "", imageUrl: "" }]);
  }

  function removeProductRow(index: number) {
    if (draftRows.length <= 1) {
      return;
    }

    setDraftRows(draftRows.filter((_, productIndex) => productIndex !== index));
  }

  async function attachProductImage(index: number, file?: File | null) {
    if (!file) {
      return;
    }

    updateProductRow(index, { imageUrl: await fileToDataUrl(file) });
  }

  async function attachBrandAsset(kind: "logoUrl" | "heroImageUrl", file?: File | null) {
    if (!file) {
      return;
    }

    setDraft({ [kind]: await fileToDataUrl(file) } as Partial<Draft>);
  }

  useEffect(() => {
    if (step === 3 && draftRows.length === 0) {
      setDraftRows(seedRows(draft.category));
    }
  }, [draft.category, draftRows.length, step]);

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
        <button className="btn-ghost" onClick={() => (step === 1 ? go("/") : setStep(step - 1))}>Back</button>
      </header>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
      {step === 1 && (
        <div className="wizard-card">
          <span className="label">01. About your store</span>
          <h2>Tell us about your business.</h2>
          <p>Give Aeris the operating details it needs to generate a relevant storefront.</p>
          <div className="field-stack">
            <Field id="store-name" label="Store name" value={draft.storeName} placeholder="Bayode Foods" onChange={(storeName) => setDraft({ storeName })} />
            <Select id="category" label="Business category" value={draft.category} placeholder="Choose a category" onChange={(category) => setDraft({ category })} options={["Fashion", "Electronics", "Food & Groceries", "Beauty & Health", "Home & Living", "Sports & Fitness", "Books & Stationery", "Other"]} />
            <Select id="city" label="Supported city" value={draft.city} placeholder="Choose a supported city" onChange={(city) => setDraft({ city: city as SupportedCity })} options={[...SUPPORTED_CITIES]} />
            <Area id="description" label="Short business description" value={draft.description} placeholder="We deliver fresh groceries and ready-to-cook essentials across Lagos." onChange={(description) => setDraft({ description })} rows={4} />
            <AssetUploadField id="draft-logo" label="Store logo upload" hint="Upload an optional logo for your storefront navigation." onFileSelect={(file) => void attachBrandAsset("logoUrl", file)} />
            <AssetUploadField id="draft-hero" label="Hero image upload" hint="Upload optional hero art for your storefront landing section." onFileSelect={(file) => void attachBrandAsset("heroImageUrl", file)} />
            <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              {draft.logoUrl ? <div className="logo-preview" style={{ backgroundImage: `url(${draft.logoUrl})` }} /> : <div className="logo-preview logo-preview-empty">LOGO</div>}
              {draft.heroImageUrl ? <div className="hero-preview-thumb" style={{ backgroundImage: `url(${draft.heroImageUrl})` }} /> : <div className="hero-preview-thumb logo-preview-empty">HERO</div>}
            </div>
          </div>
          <button className="btn-primary" onClick={next} disabled={!draft.storeName || !draft.category || !draft.city}>Next step</button>
        </div>
      )}
      {step === 2 && (
        <div className="wizard-card">
          <span className="label">02. Payout account</span>
          <h2>Where should we send your money?</h2>
          <div className="field-stack">
            <Select id="bank" label="Bank name" value={draft.bankName} placeholder="Select your bank" onChange={(bankName) => setDraft({ bankName })} options={["Access Bank", "GTBank", "Zenith Bank", "UBA", "First Bank"]} />
            <Field id="account-number" label="Account number" value={draft.accountNumber} placeholder="0123456789" onChange={(accountNumber) => setDraft({ accountNumber: accountNumber.replace(/\D/g, "").slice(0, 10), accountName: accountNumber.length >= 9 ? draft.accountName : "" })} />
            <Field id="account-name" label="Account name" value={draft.accountNumber.length === 10 ? draft.accountName || "Verified account name" : ""} placeholder="Verified account name appears here" onChange={(accountName) => setDraft({ accountName })} readOnly={draft.accountNumber.length === 10} />
            {draft.accountNumber.length === 10 ? <StatusBadge>Account verified</StatusBadge> : <span className="label">Enter 10 digits to verify account...</span>}
          </div>
          <button className="btn-primary" onClick={next} disabled={draft.accountNumber.length !== 10}>Next step</button>
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
              <Area id="bulk" label="Paste products" rows={10} value={draft.productsText} placeholder="Classic Ankara Dress | 12000 | Hand-crafted dress |" onChange={(productsText) => setDraft({ productsText })} />
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
              {draftRows.map((product, index) => (
                <div className="product-entry" key={index}>
                  <div className="product-entry-fields">
                    <Field id={`p-name-${index}`} label="Product name" value={product.name} placeholder="Smoked Jollof Party Tray" onChange={(name) => updateProductRow(index, { name })} />
                    <Field id={`p-price-${index}`} label="Price (NGN)" value={product.price} placeholder="18500.00" inputMode="decimal" onChange={(price) => updateProductRow(index, { price: sanitizePriceInput(price) })} onBlur={() => updateProductRow(index, { price: normalizePriceInput(product.price) })} />
                    <Field id={`p-desc-${index}`} label="Description" value={product.description || ""} placeholder="Family-size smoky jollof rice with fried plantain." onChange={(description) => updateProductRow(index, { description })} />
                  </div>
                  <div className="field product-image-field">
                    <AssetUploadField id={`p-img-${index}`} label="Product image" hint="Choose a product image for this storefront listing." onFileSelect={(file) => void attachProductImage(index, file)} />
                    <div className="product-thumb-stack">
                      {product.imageUrl ? <div className="product-thumb-preview" style={{ backgroundImage: `url(${product.imageUrl})` }} /> : <div className="product-thumb-preview logo-preview-empty">IMAGE</div>}
                      {product.imageUrl ? <button className="btn-danger" type="button" onClick={() => updateProductRow(index, { imageUrl: "" })}>Remove image</button> : null}
                    </div>
                  </div>
                  <button className="btn-danger product-entry-delete" type="button" aria-label="Delete product" disabled={draftRows.length <= 1} onClick={() => removeProductRow(index)}>Remove</button>
                </div>
              ))}
              <button className="btn-ghost" type="button" onClick={addProductRow} disabled={draftRows.length >= 10}>
                + Add product
              </button>
              {draftRows.length >= 10 && <span className="label">Maximum 10 products</span>}
            </div>
          )}
          <button className="btn-primary" onClick={next} disabled={parsedProducts.length < 1}>Next step</button>
        </div>
      )}
      {step === 4 && (
        <div className="wizard-card wizard-wide">
          <div>
            <span className="label">04. Your brand</span>
            <h2>Make it yours.</h2>
            <div className="field-stack">
              <BrandColorPicker color={draft.primary} onChange={(primary) => setDraft({ primary })} />
              <Field id="tagline" label="Store tagline" value={draft.tagline} placeholder="Fresh grocery bundles delivered fast across Lagos." onChange={(tagline) => setDraft({ tagline: tagline.slice(0, 80) })} />
              <span className="label">{draft.tagline.length} / 80</span>
            </div>
          </div>
          <MiniStorePreview draft={draft} />
          <button className="btn-primary" onClick={next}>Next step</button>
        </div>
      )}
      {step === 5 && (
        <div className="wizard-card">
          <span className="label">05. Review</span>
          <h2>Ready to generate.</h2>
          <div className="form-card corner-marked">
            <Corners />
            <p><strong>{draft.storeName || "Aeris Store"}</strong> - {draft.category || "General"} - {draft.city || "Lagos"}</p>
            <p>{draft.bankName || "No bank selected"} - {draft.accountNumber || "No account"} - Verified</p>
            <p>{parsedProducts.length} products added</p>
            <p><span style={{ display: "inline-block", width: 20, height: 20, background: draft.primary, verticalAlign: "middle" }} /> {draft.primary}</p>
          </div>
          <button className="btn-primary" style={{ height: 56, fontSize: 18 }} onClick={next}>Generate my store</button>
        </div>
      )}
    </div>
  );
}
function Field({ id, label, value, onChange, readOnly, disabled, placeholder, className, type = "text", inputMode, onBlur }: { id: string; label: string; value: string; onChange: (value: string) => void; readOnly?: boolean; disabled?: boolean; placeholder?: string; className?: string; type?: "text" | "email" | "password" | "number"; inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"]; onBlur?: () => void }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} type={type} inputMode={inputMode} className={`field-input ${className || ""}`.trim()} disabled={disabled} placeholder={placeholder} value={value} readOnly={readOnly} onBlur={onBlur} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Area({ id, label, value, onChange, rows, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; rows: number; placeholder?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <textarea id={id} className="field-input" rows={rows} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Select({ id, label, value, onChange, options, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; options: string[]; placeholder?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="field-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder ? <option value="" disabled>{placeholder}</option> : null}
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
            <input
              className="field-input rgb-number-input"
              inputMode="numeric"
              maxLength={3}
              value={String(rgb[channel])}
              onChange={(event) => {
                const nextValue = Number(event.target.value.replace(/\D/g, "").slice(0, 3));
                setChannel(channel, Number.isFinite(nextValue) ? Math.min(255, nextValue) : 0);
              }}
            />
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
      <h3>{draft.storeName || "Your store name"}</h3>
      <p>{draft.tagline || "A polished storefront preview will appear here as you make your selections."}</p>
      <button className="btn-primary" style={{ background: draft.primary, borderColor: draft.primary }}>Shop now</button>
    </div>
  );
}

function Generating({ go }: CommonProps) {
  const lines = ["ANALYSING BUSINESS DETAILS", "GENERATING STORE THEME CONFIGURATION", "CRAFTING HOMEPAGE LAYOUT", "WRITING PRODUCT DESCRIPTIONS", "FINALISING STOREFRONT CONTENT", "STORE READY FOR PREVIEW"];
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    const interval = window.setInterval(() => {
      setVisibleCount((current) => {
        if (current >= lines.length) {
          window.clearInterval(interval);
          return current;
        }

        return current + 1;
      });
    }, 1200);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="wizard-shell" style={{ display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div className="wireframe-box generating-loader" style={{ width: 450, maxWidth: "80vw", margin: "0 auto 32px" }}>
          <div className="orbit" />
          <span className="orbit-node one" />
          <span className="orbit-node two" />
          <span className="orbit-node three" />
          <span className="loader-core" />
        </div>
        <div style={{ display: "grid", gap: 12, textAlign: "left" }}>
          {lines.slice(0, visibleCount).map((line, index) => (
            <span className="mono generating-line" style={{ fontSize: 11 }} key={line}>
              {`[ ] 00:${String(index * 2 + 1).padStart(2, "0")} ${line}`}
            </span>
          ))}
        </div>
        <button className="btn-primary" disabled={visibleCount < lines.length} style={{ marginTop: 32 }} onClick={() => go("/onboarding/preview")}>Preview your store</button>
      </div>
    </main>
  );
}

function Preview({ state, update, go, notify }: CommonProps) {
  const products = state.store.products.filter((product) => !product.deleted);
  const [aiPrompt, setAiPrompt] = useState("");

  async function attachPreviewAsset(kind: "logoUrl" | "heroImageUrl", file?: File | null) {
    if (!file) {
      return;
    }

    const assetUrl = await fileToDataUrl(file);
    update((current) => ({
      ...current,
      draft: { ...current.draft, [kind]: assetUrl },
      store: { ...current.store, [kind]: assetUrl }
    }));
  }

  return (
    <div className="preview-shell">
      <aside className="preview-sidebar">
        <StatusBadge>Preview mode</StatusBadge>
        <p className="mono" style={{ fontSize: 11, marginTop: 16 }}>AI draft - not yet published</p>
        <hr />
        <h3>Store info</h3>
        <Field id="preview-name" label="Store name" value={state.store.name} onChange={(name) => update((current) => ({ ...current, draft: { ...current.draft, storeName: name }, store: { ...current.store, name } }))} />
        <Field id="preview-tagline" label="Store tagline" value={state.store.heroCopy} placeholder="Fast delivery for busy households across Lagos." onChange={(heroCopy) => update((current) => ({ ...current, draft: { ...current.draft, tagline: heroCopy }, store: { ...current.store, heroCopy } }))} />
        <AssetUploadField id="preview-logo" label="Store logo upload" hint="Change or confirm the logo shown in storefront navigation." onFileSelect={(file) => void attachPreviewAsset("logoUrl", file)} />
        <AssetUploadField id="preview-hero" label="Hero image upload" hint="Change or confirm the hero image shown behind the storefront headline." onFileSelect={(file) => void attachPreviewAsset("heroImageUrl", file)} />
        <div className="preview-asset-row">
          <div className="asset-preview-stack">
            <span className="field-label">Store logo</span>
            {state.store.logoUrl ? <div className="logo-preview" style={{ backgroundImage: `url(${state.store.logoUrl})` }} /> : <div className="logo-preview logo-preview-empty">LOGO</div>}
          </div>
          <div className="asset-preview-stack">
            <span className="field-label">Hero image</span>
            {state.store.heroImageUrl ? <div className="hero-preview-thumb" style={{ backgroundImage: `url(${state.store.heroImageUrl})` }} /> : <div className="hero-preview-thumb logo-preview-empty">HERO</div>}
          </div>
        </div>
        <Area id="ai" label="AI refinement" rows={4} value={aiPrompt} placeholder="Ask Aeris to warm the homepage copy or change the hero direction." onChange={setAiPrompt} />
        <button className="btn-primary" style={{ width: "100%" }} onClick={() => notify("Proposed AI changes ready for review")}>Apply changes</button>
        <button className="btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => notify("Changes discarded")}>Discard</button>
      </aside>
      <main className="preview-main">
        <span className="preview-badge status-badge"><span className="status-dot" />Preview draft</span>
        <StorefrontRenderer store={state.store} products={products} cart={state.cart} addToCart={() => undefined} preview />
        <div className="bottom-bar">
          <button className="btn-ghost" onClick={() => go("/onboarding")}>Back to editor</button>
          <button className="btn-primary" onClick={() => go("/claim")}>Claim and publish</button>
        </div>
      </main>
    </div>
  );
}

function Claim({ state, update, go, notify }: CommonProps) {
  const [email, setEmail] = useState(state.draft.leadEmail || state.auth.email || "");
  const [password, setPassword] = useState(state.auth.password || "");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [slug, setSlug] = useState(state.store.slug || slugify(state.draft.storeName));
  const slugState = slugFieldState(slug, state.store.slug);
  const passwordsMatch = password.trim().length > 0 && password === confirmPassword;
  const emailTaken = isEmailTaken(state, email) && email.trim().toLowerCase() !== (state.auth.email || "").trim().toLowerCase();

  useEffect(() => {
    setEmail(state.draft.leadEmail || state.auth.email || "");
    setSlug(state.store.slug || slugify(state.draft.storeName));
  }, [state.auth.email, state.draft.leadEmail, state.draft.storeName, state.store.slug]);

  function regenerateSlug() {
    const base = slugify(state.draft.storeName || state.store.name || "aeris-store");
    const suffix = Math.random().toString(36).slice(2, 6);
    setSlug(`${base}-${suffix}`);
  }

  return (
    <main className="wizard-shell" style={{ display: "grid", placeItems: "center" }}>
      <div className="form-card corner-marked" style={{ width: "min(480px, calc(100% - 32px))" }}>
        <Corners />
        <h2>Claim your store.</h2>
        <p>Create an account to own this draft and publish it to your Aeris subdomain.</p>
        <div className="field-stack">
          <Field id="claim-email" label="Email address" type="email" value={email} placeholder="merchant@example.com" onChange={setEmail} className={!emailLooksValid(email) || emailTaken ? "field-error" : ""} />
          <Field id="claim-password" label="Choose a password" type="password" value={password} placeholder="Create a secure password" onChange={setPassword} />
          <Field id="claim-confirm-password" label="Confirm password" type="password" value={confirmPassword} placeholder="Re-enter your password" onChange={setConfirmPassword} className={!passwordsMatch && confirmPassword ? "field-error" : ""} />
          <div className="slug-row">
            <Field id="claim-slug" label="Store slug" value={slug} onChange={(value) => setSlug(slugify(value))} placeholder="bayode-foods" className={slugState.invalid ? "field-error" : ""} />
            <button className="btn-ghost" onClick={regenerateSlug} type="button">Regenerate</button>
          </div>
          <span className={`mono ${slugState.invalid ? "form-error" : ""}`} style={{ fontSize: 11 }}>
            Your store will live at: {slug || "your-slug"}.aeris.store - {slugState.message}
          </span>
        </div>
        {emailTaken ? <span className="label form-error">X This email is already attached to another store</span> : null}
        {!passwordsMatch && confirmPassword ? <span className="label form-error">X Passwords do not match</span> : null}
        <button className="btn-primary" disabled={!slugState.available || !password.trim() || !passwordsMatch || !emailLooksValid(email) || emailTaken} style={{ width: "100%", height: 56, marginTop: 24 }} onClick={() => {
          if (emailTaken) {
            notify("That email is already attached to another merchant account");
            return;
          }
          update((current) => ({
            ...current,
            draft: { ...current.draft, leadEmail: email.trim().toLowerCase() },
            store: { ...current.store, slug, ownerEmail: email.trim().toLowerCase(), published: true },
            auth: { email: email.trim().toLowerCase(), password, loggedIn: true },
            activity: [`Published ${slug}.aeris.store`, ...current.activity]
          }));
          go("/store");
        }}>Create account and publish</button>
        <button className="btn-ghost" style={{ width: "100%", marginTop: 12 }} onClick={() => go("/login")}>Already have an account? Log in</button>
      </div>
    </main>
  );
}

function Login({ state, update, go, notify }: CommonProps) {
  const [email, setEmail] = useState(state.auth.email || state.store.ownerEmail || "");
  const [password, setPassword] = useState("");

  function startCreateStore() {
    const nextDraft = resetDraftState(emailLooksValid(email) ? email.trim().toLowerCase() : "");
    update((current) => ({
      ...current,
      draft: nextDraft,
      store: buildStore(nextDraft)
    }));
    go("/onboarding");
  }

  function login() {
    if (!email.trim() || !password.trim()) {
      notify("Enter your email and password");
      return;
    }

    if (email.trim() !== state.auth.email || password !== state.auth.password) {
      notify("Incorrect email or password");
      return;
    }

    update((current) => {
      const nextState = { ...current, auth: { ...current.auth, loggedIn: true } };
      persistState(nextState);
      return nextState;
    });
    go("/store");
  }

  return (
    <main className="wizard-shell" style={{ display: "grid", placeItems: "center" }}>
      <div className="form-card corner-marked" style={{ width: "min(480px, calc(100% - 32px))" }}>
        <Corners />
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={() => go("/")}>Back home</button>
          {state.auth.loggedIn ? <button className="btn-ghost" onClick={() => go("/store")}>Go to dashboard</button> : null}
        </div>
        <h2>Log in.</h2>
        <p>Access your Aeris merchant dashboard to manage products, orders, payouts, and storefront updates.</p>
        <div className="field-stack">
          <Field id="login-email" label="Email address" type="email" value={email} placeholder="merchant@example.com" onChange={setEmail} />
          <Field id="login-password" label="Password" type="password" value={password} placeholder="Enter your password" onChange={setPassword} />
        </div>
        <button className="btn-primary" style={{ width: "100%", height: 56, marginTop: 24 }} onClick={login}>Log in</button>
        <button className="btn-ghost" style={{ width: "100%", marginTop: 12 }} onClick={startCreateStore}>Create store</button>
      </div>
    </main>
  );
}
function Dashboard({ state, update, go, notify, section }: CommonProps & { section: "store" | "editor" | "products" | "orders" | "payouts" | "settings" }) {
  const visibleProducts = state.store.products.filter((product) => !product.deleted);
  const balance = availableBalance(state.orders, state.payouts);

  if (section === "editor") {
    return (
      <>
        <BrandNav state={state} update={update} go={go} />
        <StoreEditorPage state={state} update={update} go={go} notify={notify} />
      </>
    );
  }

  return (
    <>
      <BrandNav state={state} update={update} go={go} />
      <div className="dashboard-layout">
        <main className="dashboard-main">
          {section === "store" && <StoreOverview state={state} go={go} balance={balance} />}
          {section === "products" && <ProductsManager state={state} update={update} notify={notify} products={visibleProducts} go={go} />}
          {section === "orders" && <OrdersManager state={state} update={update} />}
          {section === "payouts" && <PayoutsManager state={state} update={update} balance={balance} />}
          {section === "settings" && <SettingsManager state={state} update={update} notify={notify} />}
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
          <div className="side-box" style={{ marginTop: 16 }}>
            <span className="label">Session</span>
            <p className="mono" style={{ fontSize: 11, color: "var(--color-forest)" }}>{state.auth.email || state.store.ownerEmail || "Merchant session"}</p>
            <button
              className="btn-ghost"
              style={{ width: "100%" }}
              onClick={() => {
                const nextState = { ...state, auth: { ...state.auth, loggedIn: false } };
                persistState(nextState);
                update(() => nextState);
                go("/login");
              }}
            >
              Logout
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

function StoreOverview({ state, go, balance }: { state: State; go: (path: string) => void; balance: number }) {
  return (
    <>
      <div className="stats-grid">
        <div className="stat-card accent-mint"><span className="label">Store status</span><span className="stat-number">{state.store.published ? "LIVE" : "DRAFT"}</span></div>
        <div className="stat-card accent-gold"><span className="label">Active products</span><span className="stat-number">{state.store.products.filter((p) => !p.deleted).length}</span></div>
        <div className="stat-card accent-coral"><span className="label">Available</span><span className="stat-number">{money(balance)}</span></div>
      </div>
      <h2>Store overview</h2>
      <p>Your storefront {state.store.published ? <>is published at <strong>{state.store.slug}.aeris.store</strong></> : "is currently in draft mode"}. Manage products, orders, payouts, and settings from the navigation above.</p>
      <div className="row"><button className="btn-primary" onClick={() => go("/products")}>Add product +</button><button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>View storefront ↗</button></div>
      <div className="two-column" style={{ marginTop: 32 }}>
        <div className="form-card corner-marked">
          <Corners />
          <span className="label">Store editor</span>
          <h3>AI draft workspace with live preview</h3>
          <p>Open the dedicated editor to draft changes, inspect the storefront preview, and only apply them when the store is ready to go live again.</p>
          {state.store.published ? (
            <>
              <span className="chip coral">Unpublish required before editing</span>
              <p className="editor-note">Editing is restricted to draft mode so shoppers never see partial changes while browsing your store.</p>
              <button className="btn-danger" onClick={() => go("/settings")}>Go to settings</button>
            </>
          ) : (
            <button className="btn-primary" onClick={() => go("/store/editor")}>Open AI editor →</button>
          )}
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

type ThoughtStepStatus = "pending" | "active" | "completed" | "error";

function buildAiPreviewStore(store: Store, prompt: string): Store {
  const lowerPrompt = prompt.toLowerCase();
  const wantsHeroArt = lowerPrompt.includes("hero") || lowerPrompt.includes("background") || lowerPrompt.includes("image");
  const wantsPremium = lowerPrompt.includes("premium") || lowerPrompt.includes("luxury") || lowerPrompt.includes("elevated");
  const wantsFresh = lowerPrompt.includes("fresh") || lowerPrompt.includes("clean");

  return {
    ...store,
    heroTitle: wantsPremium ? `${store.name.toUpperCase()} CURATED FOR MODERN HOMES.` : `${store.name.toUpperCase()} REIMAGINED FOR ${store.city.toUpperCase()}.`,
    heroCopy: wantsFresh
      ? "Cleaner copy, sharper hierarchy, and a calmer storefront rhythm for returning shoppers."
      : `AI draft update: ${prompt}`,
    heroImageUrl: wantsHeroArt ? `https://images.aeris.store/generated/${slugify(store.name)}-${Date.now().toString(36)}.jpg` : store.heroImageUrl
  };
}

function StoreEditorPage({ state, update, go, notify }: CommonProps) {
  const [prompt, setPrompt] = useState("Refresh the hero copy and make the storefront feel more premium.");
  const [previewStore, setPreviewStore] = useState<Store>(state.store);
  const [isRunning, setIsRunning] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [traceOpen, setTraceOpen] = useState(true);
  const [stepStatuses, setStepStatuses] = useState<ThoughtStepStatus[]>(["pending", "pending", "pending", "pending"]);

  useEffect(() => {
    setPreviewStore(state.store);
  }, [state.store]);

  function runAiDraft() {
    const nextPreview = buildAiPreviewStore(state.store, prompt);
    setPreviewStore(nextPreview);
    setIsRunning(true);
    setIsReady(false);
    setTraceOpen(true);
    setStepStatuses(["active", "pending", "pending", "pending"]);

    window.setTimeout(() => setStepStatuses(["completed", "active", "pending", "pending"]), 900);
    window.setTimeout(() => setStepStatuses(["completed", "completed", "active", "pending"]), 1800);
    window.setTimeout(() => setStepStatuses(["completed", "completed", "completed", "active"]), 2700);
    window.setTimeout(() => {
      setStepStatuses(["completed", "completed", "completed", "completed"]);
      setIsRunning(false);
      setIsReady(true);
    }, 3600);
  }

  function applyPreview() {
    update((current) => {
      const nextState = {
        ...current,
        draft: {
          ...current.draft,
          tagline: previewStore.heroCopy,
          logoUrl: previewStore.logoUrl || "",
          heroImageUrl: previewStore.heroImageUrl || ""
        },
        store: previewStore,
        activity: [`AI drafted storefront changes: ${prompt}`, ...current.activity]
      };
      persistState(nextState);
      return nextState;
    });
    notify("Draft storefront changes applied");
    go("/store");
  }

  if (state.store.published) {
    return (
      <div className="form-card corner-marked" style={{ maxWidth: 760 }}>
        <Corners />
        <span className="label">Store editor locked</span>
        <h2>Unpublish before making storefront changes.</h2>
        <p>This editor only runs in draft mode so customers never see half-finished AI updates. Unpublish, refine the store here, preview the result, then publish again.</p>
        <div className="row">
          <button className="btn-ghost" onClick={() => go("/store")}>← Back to overview</button>
          <button className="btn-danger" onClick={() => go("/settings")}>Go to settings</button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-shell page-with-nav-gap">
      <aside className="preview-sidebar">
        <span className="label">Live store AI editor</span>
        <h2 style={{ marginTop: 12 }}>Draft changes before you republish.</h2>
        <p>Prompt the AI, watch the Chain of Thought run, then review the storefront preview before applying anything.</p>
        <Area id="editor-prompt" label="Prompt" rows={6} value={prompt} onChange={setPrompt} />
        <div className="row" style={{ marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn-primary" disabled={isRunning || !prompt.trim()} onClick={runAiDraft}>Generate draft changes</button>
          <button className="btn-ghost" onClick={() => go("/settings")}>Edit brand assets</button>
        </div>
        {(isRunning || isReady) && <ChainOfThoughtCard statuses={stepStatuses} running={isRunning} ready={isReady} open={traceOpen} onToggle={() => setTraceOpen((current) => !current)} />}
        {isReady && (
          <div className="form-card" style={{ marginTop: 24, padding: 24 }}>
            <span className="label">Proposed changes</span>
            <p className="editor-note">Hero messaging is tightened, storefront voice is more premium, and hero art is refreshed when your prompt asks for it.</p>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={applyPreview}>Apply draft to store</button>
              <button className="btn-ghost" onClick={() => {
                setPreviewStore(state.store);
                setIsReady(false);
                setTraceOpen(true);
                setStepStatuses(["pending", "pending", "pending", "pending"]);
              }}>Discard</button>
            </div>
          </div>
        )}
      </aside>
      <div className="preview-main editor-preview-panel">
        <div className="preview-badge status-badge"><span className="status-dot" /><span>Draft preview</span></div>
        <StorefrontRenderer store={previewStore} products={previewStore.products.filter((product) => !product.deleted)} cart={state.cart} addToCart={() => {}} preview />
      </div>
    </div>
  );
}

function ChainOfThoughtCard({ statuses, running, ready, open, onToggle }: { statuses: ThoughtStepStatus[]; running: boolean; ready: boolean; open: boolean; onToggle: () => void }) {
  const steps = [
    "Reading your storefront prompt",
    "Rewriting hero voice and positioning",
    "Adjusting storefront presentation",
    "Preparing preview-ready draft"
  ];

  const summaries = [
    "Understanding the merchant request and locking onto the right store context.",
    "Reworking headline language, hierarchy, and brand positioning for the storefront.",
    "Applying the copy direction to the hero and storefront presentation choices.",
    "Preparing a preview-safe draft the merchant can inspect before applying."
  ];

  return (
    <div className="chain-card">
      <button className={`chain-trigger ${running ? "active" : ""}`} type="button" onClick={onToggle}>
        <span className="chain-trigger-leading">
          <ChainBrainIcon />
          <span>{running ? "AI is updating your storefront draft" : "AI draft reasoning complete"}</span>
        </span>
        <ChainChevronIcon open={open} />
      </button>
      {open && <div className="chain-content">
        {steps.map((label, index) => (
          <div className="chain-step" data-status={statuses[index]} key={label}>
            <div className="chain-step-title">
              <span className="chain-step-icon"><StepIcon status={statuses[index]} /></span>
              <span>{label}</span>
            </div>
            <div className="chain-step-copy">
              {statuses[index] === "completed" && summaries[index]}
              {statuses[index] === "active" && summaries[index]}
              {statuses[index] === "pending" && "Queued and waiting for the previous AI step to complete."}
              {statuses[index] === "error" && "This step needs attention before the draft can continue."}
            </div>
          </div>
        ))}
        {ready && <div className="chain-complete">All draft steps complete</div>}
      </div>}
    </div>
  );
}

function ProductsManager({ state, update, notify, products, go }: { state: State; update: CommonProps["update"]; notify: (m: string) => void; products: Product[]; go: (path: string) => void }) {
  function patchProduct(id: string, patch: Partial<Product>) {
    update((current) => {
      const nextSource: ProductSource | undefined = patch.name || patch.description || patch.price ? "merchant" : undefined;
      const nextState = {
        ...current,
        store: {
          ...current.store,
          products: current.store.products.map((product) => product.id === id ? { ...product, ...patch, source: nextSource || product.source } : product)
        }
      };
      persistState(nextState);
      return nextState;
    });
  }
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}><h2>Products</h2><button className="btn-primary" onClick={() => go("/products/new")}>Add product +</button></div>
      <div className="table">
        {products.map((product) => (
          <div className="table-row" key={product.id}>
            <strong>{product.name}<br /><span className="label">{product.slug}</span></strong>
            <span>{money(product.price)}</span>
            <span className={`chip ${product.source === "ai" ? "gold" : product.inStock ? "mint" : "coral"}`}>{product.source === "ai" ? "AI Draft" : product.inStock ? "In stock" : "Out of stock"}</span>
            <button className="btn-ghost" onClick={() => {
              patchProduct(product.id, { inStock: !product.inStock });
              notify(product.inStock ? "Product marked out of stock" : "Product restocked");
            }}>{product.inStock ? "Mark out" : "Restock"}</button>
            <button className="btn-ghost" onClick={() => go(`/products/${product.id}`)}>Edit</button>
            <button className="btn-danger" onClick={() => {
              patchProduct(product.id, { deleted: true, featured: false });
              notify("Product removed");
            }}>Delete</button>
          </div>
        ))}
      </div>
    </>
  );
}

function ProductEditorPage({ state, update, go, notify, mode }: CommonProps & { mode: "create" | "edit" }) {
  const pathname = usePathname();
  const productId = pathname.split("/").pop() || "";
  const existing = mode === "edit" ? state.store.products.find((product) => product.id === productId) : undefined;
  const [name, setName] = useState(existing?.name || "");
  const [price, setPrice] = useState(existing ? String(existing.price) : "");
  const [description, setDescription] = useState(existing?.description || "");
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl || "");
  const [inStock, setInStock] = useState(existing?.inStock ?? true);

  useEffect(() => {
    setName(existing?.name || "");
    setPrice(existing ? String(existing.price) : "");
    setDescription(existing?.description || "");
    setImageUrl(existing?.imageUrl || "");
    setInStock(existing?.inStock ?? true);
  }, [existing]);

  async function uploadImage(file?: File | null) {
    if (!file) {
      return;
    }

    setImageUrl(await fileToDataUrl(file));
  }

  function saveProduct() {
    if (!name.trim() || !price.trim()) {
      notify("Product name and price are required");
      return;
    }

    const parsedPrice = Number(price.replace(/\D/g, "")) || 0;
    update((current) => {
      const nextProducts = mode === "edit" && existing
        ? current.store.products.map((product) => product.id === existing.id ? {
          ...product,
          name: name.trim(),
          price: parsedPrice,
          description: description.trim(),
          imageUrl,
          inStock,
          source: "merchant" as ProductSource
        } : product)
        : [
          ...current.store.products,
          makeProduct({ name: name.trim(), price: parsedPrice, description: description.trim(), imageUrl }, current.store.products.length)
        ];
      const nextState = { ...current, store: { ...current.store, products: nextProducts }, activity: [`${mode === "edit" ? "Updated" : "Created"} product ${name.trim()}`, ...current.activity] };
      persistState(nextState);
      return nextState;
    });
    notify(mode === "edit" ? "Product updated" : "Product created");
    go("/products");
  }

  if (mode === "edit" && !existing) {
    return (
      <>
        <BrandNav state={state} update={update} go={go} />
        <main className="container section-block page-with-dashboard-nav">
          <div className="empty-state">
            <p>This product could not be found.</p>
            <button className="btn-ghost" onClick={() => go("/products")}>Back to products</button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <BrandNav state={state} update={update} go={go} />
      <main className="container section-block page-with-dashboard-nav">
        <div className="form-card corner-marked product-editor-shell">
          <Corners />
          <button className="btn-ghost" onClick={() => go("/products")}>← Back to products</button>
          <h2 style={{ marginTop: 24 }}>{mode === "edit" ? "Edit product" : "Add product"}</h2>
          <div className="field-stack" style={{ marginTop: 24 }}>
            <Field id="product-name" label="Product name" value={name} placeholder="Smoked Jollof Party Tray" onChange={setName} />
            <Field id="product-price" label="Price (NGN)" value={price} placeholder="18500" onChange={setPrice} />
            <Area id="product-description" label="Description" rows={6} placeholder="Describe the product shoppers will receive." value={description} onChange={setDescription} />
            <AssetUploadField id="product-image" label="Product image upload" hint="Upload the product image shoppers will see on the storefront." onFileSelect={(file) => void uploadImage(file)} />
            <div className="row" style={{ alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
              {imageUrl ? <div className="product-image-preview" style={{ backgroundImage: `url(${imageUrl})` }} /> : <div className="product-image-preview logo-preview-empty">IMAGE</div>}
              {imageUrl ? <button className="btn-danger" onClick={() => setImageUrl("")}>Remove image</button> : null}
            </div>
            <div className="toggle-row">
              <span className="field-label">Availability</span>
              <button className={inStock ? "btn-primary" : "btn-ghost"} onClick={() => setInStock((current) => !current)} type="button">
                {inStock ? "In stock" : "Out of stock"}
              </button>
            </div>
          </div>
          <div className="row" style={{ marginTop: 24, justifyContent: "space-between", flexWrap: "wrap" }}>
            <button className="btn-ghost" onClick={() => go("/products")}>Discard</button>
            <button className="btn-primary" onClick={saveProduct}>Save product</button>
          </div>
        </div>
      </main>
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
      }}>Request payout -{">"}</button></div>
      <div className="table" style={{ marginTop: 24 }}>{state.payouts.map((payout) => <div className="table-row" key={payout.id}><span>{payout.createdAt.slice(0, 10)}</span><strong>{money(payout.amount)}</strong><span>{state.draft.bankName}</span><span className="chip gold">{payout.status}</span><span>{payout.id}</span></div>)}</div>
    </>
  );
}

function SettingsManager({ state, update, notify }: { state: State; update: CommonProps["update"]; notify: CommonProps["notify"] }) {
  const locked = state.store.published;
  const [storeName, setStoreName] = useState(state.store.name);
  const [tagline, setTagline] = useState(state.store.heroCopy);
  const [logoUrl, setLogoUrl] = useState(state.store.logoUrl || "");
  const [heroImageUrl, setHeroImageUrl] = useState(state.store.heroImageUrl || "");

  useEffect(() => {
    setStoreName(state.store.name);
    setTagline(state.store.heroCopy);
    setLogoUrl(state.store.logoUrl || "");
    setHeroImageUrl(state.store.heroImageUrl || "");
  }, [state.store]);

  async function uploadAsset(kind: "logo" | "hero", file?: File | null) {
    if (!file) {
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    if (kind === "logo") {
      setLogoUrl(dataUrl);
      return;
    }
    setHeroImageUrl(dataUrl);
  }

  function saveSettings() {
    if (locked) {
      notify("Unpublish the store before editing settings");
      return;
    }

    update((current) => {
      const nextState = {
        ...current,
        draft: {
          ...current.draft,
          storeName,
          tagline,
          logoUrl,
          heroImageUrl
        },
        store: {
          ...current.store,
          name: storeName,
          heroCopy: tagline,
          logoUrl,
          heroImageUrl
        },
        activity: [`Saved store settings for ${storeName}`, ...current.activity]
      };
      persistState(nextState);
      return nextState;
    });
    notify("Store settings saved");
  }

  function clearAsset(kind: "logo" | "hero") {
    if (kind === "logo") {
      setLogoUrl("");
      return;
    }
    setHeroImageUrl("");
  }

  return (
    <>
      <h2>Settings</h2>
      <div className="field-stack" style={{ maxWidth: 720 }}>
        {locked ? <span className="chip gold">Store settings are locked while published</span> : null}
        <Field id="settings-name" label="Store name" value={storeName} onChange={setStoreName} readOnly={locked} disabled={locked} />
        <Field id="settings-tagline" label="Tagline" value={tagline} onChange={setTagline} readOnly={locked} disabled={locked} />
        <AssetUploadField id="settings-logo" label="Store logo upload" hint="Upload the logo shown in your storefront navigation." disabled={locked} onFileSelect={(file) => void uploadAsset("logo", file)} />
        <AssetUploadField id="settings-hero-image" label="Hero background image upload" hint="Upload the background art used behind the storefront hero." disabled={locked} onFileSelect={(file) => void uploadAsset("hero", file)} />
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="asset-preview-stack">
            {logoUrl ? <div className="logo-preview" style={{ backgroundImage: `url(${logoUrl})` }} /> : <div className="logo-preview logo-preview-empty">LOGO</div>}
            {logoUrl && !locked ? <button className="btn-danger" onClick={() => clearAsset("logo")}>Remove logo</button> : null}
          </div>
          <div className="asset-preview-stack">
            {heroImageUrl ? <div className="hero-preview-thumb" style={{ backgroundImage: `url(${heroImageUrl})` }} /> : <div className="hero-preview-thumb logo-preview-empty">HERO</div>}
            {heroImageUrl && !locked ? <button className="btn-danger" onClick={() => clearAsset("hero")}>Remove hero</button> : null}
          </div>
        </div>
        <p className="mono" style={{ color: "var(--color-gold)", fontSize: 10 }}>Warning: slug is locked after publish and cannot be changed.</p>
        <button className="btn-primary" disabled={locked} onClick={saveSettings}>Save changes</button>
        <button
          className="btn-ghost"
          onClick={() => {
            update((current) => {
              const nextState = { ...current, auth: { ...current.auth, loggedIn: false } };
              persistState(nextState);
              return nextState;
            });
            window.location.href = "/login";
          }}
        >
          Logout
        </button>
      </div>
    </>
  );
}

function AssetUploadField({ id, label, hint, onFileSelect, disabled }: { id: string; label: string; hint: string; onFileSelect: (file?: File | null) => void; disabled?: boolean }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <label className={`asset-upload ${disabled ? "asset-upload-disabled" : ""}`} htmlFor={id}>
        <span className="asset-upload-copy">Choose image</span>
        <span className="asset-upload-hint">{hint}</span>
      </label>
      <input disabled={disabled} id={id} className="asset-upload-input" type="file" accept="image/*" onChange={(event) => onFileSelect(event.target.files?.[0])} />
    </div>
  );
}

function PublicStore({ state, update, go, notify }: CommonProps) {
  const products = state.store.products.filter((product) => !product.deleted);
  function add(product: Product) {
    update((current) => {
      const existing = current.cart.find((line) => line.productId === product.id);
      const cart = existing ? current.cart.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line) : [...current.cart, { productId: product.id, quantity: 1 }];
      const nextState = { ...current, cart };
      persistState(nextState);
      return nextState;
    });
    notify("Added to cart");
  }
  return <StorefrontRenderer store={state.store} products={products} cart={state.cart} addToCart={add} go={go} />;
}

function StorefrontRenderer({ store, products, cart, addToCart, go, preview }: { store: Store; products: Product[]; cart: CartLine[]; addToCart: (product: Product) => void; go?: (path: string) => void; preview?: boolean }) {
  const [searchQuery, setSearchQuery] = useState("");
  const featured = products.filter((product) => product.featured && product.source === "merchant" && product.inStock).slice(0, 4);
  const searching = searchQuery.trim().length > 0;
  const filteredProducts = products.filter((product) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return product.name.toLowerCase().includes(query) || (product.description || "").toLowerCase().includes(query);
  });

  useEffect(() => {
    if (searching) {
      document.getElementById("store-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searching, searchQuery]);

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
          <button className="btn-primary" onClick={() => document.getElementById("store-products")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Shop now -&gt;</button>
        </div>
      </section>
      {!searching && <section className="section-block"><div className="container"><span className="label">Featured</span><h2>Hand-picked for you.</h2><div className="store-product-grid">{(featured.length ? featured : products).map((product) => <StoreProductCard key={product.id} product={product} addToCart={addToCart} />)}</div></div></section>}
      <section className="section-block" id="store-products"><div className="container"><span className="label">{searching ? "Search results" : "All products"}</span><h2>{searching ? `Results for "${searchQuery.trim()}"` : "The collection."}</h2>{filteredProducts.length === 0 ? <div className="empty-state"><p>No products match this search yet.</p></div> : <div className="store-product-grid">{filteredProducts.map((product) => <StoreProductCard key={`${product.id}-all`} product={product} addToCart={addToCart} />)}</div>}</div></section>
      <footer className="section-block"><div className="container row" style={{ justifyContent: "space-between" }}><span>{store.name} / {store.city} / {store.category}</span><span className="label">Powered by Aeris</span></div></footer>
    </main>
  );
}

function StoreProductCard({ product, addToCart }: { product: Product; addToCart: (product: Product) => void }) {
  return (
    <article className="product-card">
      <div className="product-image" style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{product.imageUrl ? "" : product.name}</div>
      <div className="product-body">
        {product.source === "ai" && <span className="chip gold">AI Draft</span>}
        {!product.inStock && <span className="chip coral">Out of stock</span>}
        <strong>{product.name}</strong>
        <p>{product.description}</p>
        <h3>{money(product.price)}</h3>
        <button className="btn-ghost" disabled={!product.inStock} onClick={() => addToCart(product)}>{product.inStock ? "Add to cart" : "Out of stock"}</button>
      </div>
    </article>
  );
}

function CartPage({ state, go, update }: CommonProps) {
  const products = state.cart.map((line) => ({ line, product: state.store.products.find((product) => product.id === line.productId) })).filter((entry) => entry.product);
  const totals = calculateCheckout(state.store.products, state.cart, state.store.city);
  return (
    <>
      <StoreUtilityNav store={state.store} cartCount={state.cart.reduce((sum, line) => sum + line.quantity, 0)} go={go} />
      <main className="container section-block page-with-store-nav">
        <button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>{"<-"} Continue shopping</button>
        <h2 style={{ marginTop: 32 }}>Your cart</h2>
        {products.length === 0 ? <div className="empty-state"><button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>Continue shopping -&gt;</button></div> : <CartContents state={state} go={go} update={update} totals={totals} />}
    </main>
    </>
  );
}

function CartContents({ state, go, update, totals }: { state: State; go: (path: string) => void; update: CommonProps["update"]; totals: ReturnType<typeof calculateCheckout> }) {
  function mutateCart(productId: string, nextQuantity: number) {
    update((current) => {
      const cart = nextQuantity <= 0
        ? current.cart.filter((line) => line.productId !== productId)
        : current.cart.map((line) => line.productId === productId ? { ...line, quantity: nextQuantity } : line);
      const nextState = { ...current, cart };
      persistState(nextState);
      return nextState;
    });
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
      <div className="form-card corner-marked"><Corners /><span className="label">Order summary</span><p>Subtotal: {money(totals.subtotal)}</p><p>Logistics: {money(totals.logisticsFee)}</p><h3>Total: {money(totals.total)}</h3><button className="btn-primary" onClick={() => go("/checkout")}>Proceed to checkout -&gt;</button></div>
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
        <div className="form-card corner-marked"><Corners /><button className="btn-ghost" onClick={() => go("/cart")}>{"<-"} Back to cart</button><h2 style={{ marginTop: 24 }}>Checkout</h2><Field id="full-name" label="Full name" value={details.fullName} onChange={(fullName) => setDetails({ ...details, fullName })} /><Field id="phone" label="Phone number" value={details.phone} onChange={(phone) => setDetails({ ...details, phone })} /><Select id="delivery-city" label="Delivery city" value={details.city} onChange={(city) => setDetails({ ...details, city: city as SupportedCity })} options={[...SUPPORTED_CITIES]} /><Field id="address" label="Address line" value={details.address} onChange={(address) => setDetails({ ...details, address })} /><button className="btn-primary" style={{ width: "100%", height: 56, marginTop: 16 }} onClick={() => {
        if (!isSupportedCity(details.city)) return;
        const items = state.cart.map((line) => {
          const product = state.store.products.find((candidate) => candidate.id === line.productId)!;
          return { productId: product.id, name: product.name, quantity: line.quantity, unitPrice: product.price };
        });
        const order: Order = { id: cryptoId("order"), reference: `AERIS_${Date.now().toString(36).toUpperCase()}`, storeId: state.store.id, items, subtotal: totals.subtotal, logisticsFee: totals.logisticsFee, platformFee: totals.platformFee, merchantEarnings: totals.merchantEarnings, status: "paid", paymentState: "paid", delivery: details, createdAt: new Date().toISOString(), payoutAllocated: 0 };
        update((current) => ({ ...current, cart: [], orders: [order, ...current.orders], activity: [`New paid order ${order.reference}`, ...current.activity] }));
        notify("New order paid through Kora");
        go(`/order/${order.reference}?success=1`);
      }}>Proceed to payment -&gt;</button></div>
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
          <button className="btn-ghost" onClick={() => go(`/s/${state.store.slug}`)}>{'<-'} Back to store</button>
        </div>
        {order ? <><StatusBadge>Payment confirmed</StatusBadge><h2>Order status</h2><p className="mono">#{order.reference}</p><div className="form-card"><h3>{order.status.toUpperCase()}</h3><p>Delivery to {order.delivery.fullName}, {order.delivery.address}, {order.delivery.city}.</p></div></> : <div className="empty-state">Order not found.</div>}
      </main>
    </>
  );
}

function StoreUtilityNav({ store, cartCount, go }: { store: Store; cartCount: number; go: (path: string) => void }) {
  return (
    <nav className="store-nav utility-nav">
      <button className="nav-link" onClick={() => go(`/s/${store.slug}`)}>{"<-"} Storefront</button>
      <strong style={{ fontFamily: "var(--font-display)", color: "var(--color-forest)" }}>{store.name}</strong>
      <button className="btn-ghost" onClick={() => go("/cart")}>Cart <span className="cart-pill">{cartCount}</span></button>
    </nav>
  );
}
