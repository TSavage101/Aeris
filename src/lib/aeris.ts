export const SUPPORTED_CITIES = ["Lagos", "Abuja"] as const;

export type SupportedCity = (typeof SUPPORTED_CITIES)[number];
export type OrderStatus = "paid" | "processing" | "out_for_delivery" | "delivered" | "cancelled";
export type ProductSource = "merchant" | "ai";
export type PayoutStatus = "requested" | "processing" | "paid" | "failed";

export type ProductInput = {
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
};

export type Product = ProductInput & {
  id: string;
  slug: string;
  source: ProductSource;
  inStock: boolean;
  featured: boolean;
  deleted: boolean;
  order: number;
};

export type StoreTheme = {
  primary: string;
  secondary: string;
  accent: string;
  template: "provisions" | "fashion" | "beauty" | "general";
  navAlignment: "left" | "center";
  productRadius: 0 | 2;
};

export type Store = {
  id: string;
  slug: string;
  name: string;
  city: SupportedCity;
  category: string;
  logoUrl?: string;
  heroImageUrl?: string;
  ownerEmail?: string;
  bankVerified: boolean;
  published: boolean;
  suspended: boolean;
  theme: StoreTheme;
  heroTitle: string;
  heroCopy: string;
  products: Product[];
  previousSnapshot?: Pick<Store, "theme" | "heroTitle" | "heroCopy">;
};

export type CartLine = {
  productId: string;
  quantity: number;
};

export type CheckoutDetails = {
  fullName: string;
  phone: string;
  email?: string;
  address: string;
  landmark?: string;
  city: SupportedCity;
};

export type Order = {
  id: string;
  reference: string;
  storeId: string;
  koraReference?: string;
  items: Array<{ productId: string; name: string; quantity: number; unitPrice: number }>;
  subtotal: number;
  logisticsFee: number;
  platformFee: number;
  merchantEarnings: number;
  status: OrderStatus;
  paymentState: "pending" | "paid";
  delivery: CheckoutDetails;
  createdAt: string;
  payoutAllocated: number;
};

export type PayoutRequest = {
  id: string;
  amount: number;
  status: PayoutStatus;
  koraReference?: string;
  failureReason?: string;
  allocatedOrderRefs: string[];
  createdAt: string;
};

export type ActivityEvent = {
  id: string;
  label: string;
  at: string;
};

export const LOGISTICS_FEE_BY_CITY: Record<SupportedCity, number> = {
  Lagos: 2500,
  Abuja: 3000
};

export function isSupportedCity(city: string): city is SupportedCity {
  return SUPPORTED_CITIES.includes(city as SupportedCity);
}

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

  return slug || "store";
}

export function money(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(value);
}

export function parseProductsBulk(text: string): ProductInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", price = "", description = "", imageUrl = ""] = line.split("|").map((part) => part.trim());
      const numericPrice = Number(price.replace(/[^\d.]/g, ""));

      return {
        name,
        price: Number.isFinite(numericPrice) ? numericPrice : 0,
        description,
        imageUrl
      };
    })
    .filter((product) => product.name.length > 0 && product.price > 0);
}

export function makeProduct(input: ProductInput, index: number, source: ProductSource = "merchant"): Product {
  return {
    id: cryptoId("prod"),
    slug: `${slugify(input.name)}-${index + 1}`,
    name: input.name,
    price: input.price,
    description: input.description || `A polished ${input.name.toLowerCase()} listing prepared for fast online sales.`,
    imageUrl: input.imageUrl || "",
    source,
    inStock: true,
    featured: source === "merchant" && index < 4,
    deleted: false,
    order: index
  };
}

export function generateAiProducts(category: string, count: number, startIndex: number): Product[] {
  const byCategory: Record<string, Array<[string, string, number]>> = {
    "Food & Groceries": [
      ["Weekend Soup Pack", "A ready-to-order pantry and soup ingredient bundle for fast household cooking.", 14500],
      ["Fresh Market Basket", "An everyday essentials mix curated for repeat home deliveries.", 12000],
      ["Family Rice Combo", "A strong homepage product for families stocking up for the week.", 18500]
    ],
    Fashion: [
      ["Signature Ankara Set", "A hero-ready listing with premium visual appeal for fashion-first storefronts.", 22000],
      ["Weekend Casual Drop", "A clean everyday style option designed for repeat purchases.", 16500],
      ["Statement Look Bundle", "A polished lead product that helps the storefront feel immediately merchandised.", 28000]
    ],
    Electronics: [
      ["Starter Gadget Pack", "A practical bundle positioned for high-intent electronics shoppers.", 35000],
      ["Home Setup Essential", "A dependable product listing that makes the catalog feel complete.", 42000],
      ["Portable Power Pick", "A conversion-friendly product designed to strengthen the hero section.", 18000]
    ],
    "Beauty & Health": [
      ["Glow Care Kit", "A premium self-care bundle created to anchor a beauty storefront.", 19500],
      ["Daily Skin Routine", "An approachable repeat-purchase product for returning customers.", 14000],
      ["Wellness Essentials", "A polished wellness listing that rounds out the starter catalog.", 21000]
    ]
  };

  const templates = byCategory[category] || [
    ["Signature Bundle", "A curated starter bundle designed to make the storefront feel complete.", 15000],
    ["Weekend Pick", "A customer-friendly option with strong homepage appeal.", 13000],
    ["Everyday Essential", "A reliable catalog staple for repeat purchases.", 11000]
  ];

  return templates.slice(0, count).map(([name, description, price], offset) =>
    makeProduct(
      {
        name,
        price: price + offset * 1000,
        description
      },
      startIndex + offset,
      "ai"
    )
  );
}

export function calculateCheckout(products: Product[], cart: CartLine[], city: SupportedCity) {
  const subtotal = cart.reduce((total, line) => {
    const product = products.find((candidate) => candidate.id === line.productId);
    return total + (product ? product.price * line.quantity : 0);
  }, 0);
  const logisticsFee = LOGISTICS_FEE_BY_CITY[city];
  const platformFee = Math.round(subtotal * 0.05);

  return {
    subtotal,
    logisticsFee,
    platformFee,
    total: subtotal + logisticsFee,
    merchantEarnings: subtotal - platformFee
  };
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    paid: ["processing", "cancelled"],
    processing: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["delivered"],
    delivered: [],
    cancelled: []
  };

  return allowed[from].includes(to);
}

export function availableBalance(orders: Order[], payouts: PayoutRequest[]) {
  const unlocked = orders
    .filter((order) => ["processing", "out_for_delivery", "delivered"].includes(order.status))
    .reduce((sum, order) => sum + order.merchantEarnings, 0);
  const unavailablePayouts = payouts
    .filter((payout) => payout.status === "requested" || payout.status === "processing" || payout.status === "paid")
    .reduce((sum, payout) => sum + payout.amount, 0);

  return Math.max(0, unlocked - unavailablePayouts);
}

export function allocatePayout(amount: number, orders: Order[]) {
  let remaining = amount;
  const refs: string[] = [];

  for (const order of orders.filter((candidate) => candidate.status !== "paid" && candidate.status !== "cancelled")) {
    const available = order.merchantEarnings - order.payoutAllocated;

    if (available <= 0 || remaining <= 0) {
      continue;
    }

    const draw = Math.min(available, remaining);
    order.payoutAllocated += draw;
    remaining -= draw;
    refs.push(order.reference);
  }

  return { refs, remaining };
}

export function cryptoId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}
