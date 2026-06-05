import type { CartLine, CheckoutDetails, Order, PayoutRequest, Store, SupportedCity } from "@/lib/aeris";

export type Draft = {
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

export type SessionAuth = {
  email: string;
  password: string;
  loggedIn: boolean;
};

export type SessionState = {
  draft: Draft;
  store: Store;
  orders: Order[];
  payouts: PayoutRequest[];
  cart: CartLine[];
  activity: string[];
  auth: SessionAuth;
};

export const defaultDraft: Draft = {
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

function buildEmptyStore(): Store {
  return {
    id: "store_draft",
    slug: "aeris-store",
    name: "Aeris Store",
    city: "Lagos",
    category: "General",
    logoUrl: "",
    heroImageUrl: "",
    ownerEmail: "",
    bankVerified: false,
    published: false,
    suspended: false,
    theme: {
      primary: "#1A3C2B",
      secondary: "#FF8C69",
      accent: "#9EFFBF",
      template: "provisions",
      navAlignment: "left",
      productRadius: 0
    },
    heroTitle: "AERIS STORE DELIVERED FAST.",
    heroCopy: "Discover curated offers built for shoppers across Lagos and Abuja.",
    products: []
  };
}

export function buildInitialSessionState(leadEmail = ""): SessionState {
  return {
    draft: {
      ...defaultDraft,
      leadEmail
    },
    store: buildEmptyStore(),
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
}

export function normalizeSessionState(saved?: Partial<SessionState> | null): SessionState {
  const initial = buildInitialSessionState(saved?.draft?.leadEmail || "");

  return {
    ...initial,
    ...saved,
    draft: {
      ...initial.draft,
      ...(saved?.draft || {})
    },
    store: {
      ...initial.store,
      ...(saved?.store || {}),
      theme: {
        ...initial.store.theme,
        ...(saved?.store?.theme || {})
      },
      products: saved?.store?.products || initial.store.products
    },
    orders: saved?.orders || initial.orders,
    payouts: saved?.payouts || initial.payouts,
    cart: saved?.cart || initial.cart,
    activity: saved?.activity || initial.activity,
    auth: {
      ...initial.auth,
      ...(saved?.auth || {}),
      password: "",
      loggedIn: Boolean(saved?.auth?.loggedIn)
    }
  };
}

export function sanitizeStateForStorage(state: SessionState): SessionState {
  return {
    ...normalizeSessionState(state),
    auth: {
      ...state.auth,
      password: "",
      loggedIn: Boolean(state.auth.loggedIn)
    }
  };
}

export function mergePublicStoreState(baseState: SessionState, publicState: SessionState): SessionState {
  return {
    ...baseState,
    store: publicState.store,
    auth: {
      ...baseState.auth,
      password: ""
    }
  };
}

export type SessionBootstrapResult = {
  state: SessionState;
  kind: "guest" | "merchant";
};

