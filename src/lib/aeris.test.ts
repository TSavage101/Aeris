import { describe, expect, it } from "vitest";
import {
  availableBalance,
  calculateCheckout,
  canTransitionOrder,
  generateAiProducts,
  makeProduct,
  parseProductsBulk
} from "./aeris";

describe("Aeris business rules", () => {
  it("parses merchant bulk products from the PRD line format", () => {
    expect(parseProductsBulk("Jollof Bowl | ₦4500 | Smoky party rice | https://img.test/a.jpg")).toEqual([
      {
        name: "Jollof Bowl",
        price: 4500,
        description: "Smoky party rice",
        imageUrl: "https://img.test/a.jpg"
      }
    ]);
  });

  it("calculates subtotal, logistics, platform fee, and merchant earnings", () => {
    const product = makeProduct({ name: "Ankara Tote", price: 10000 }, 0);
    expect(calculateCheckout([product], [{ productId: product.id, quantity: 2 }], "Lagos")).toMatchObject({
      subtotal: 20000,
      logisticsFee: 2500,
      platformFee: 1000,
      total: 22500,
      merchantEarnings: 19000
    });
  });

  it("keeps order state transitions constrained", () => {
    expect(canTransitionOrder("paid", "processing")).toBe(true);
    expect(canTransitionOrder("paid", "delivered")).toBe(false);
    expect(canTransitionOrder("delivered", "cancelled")).toBe(false);
  });

  it("only unlocks payout balance after processing begins", () => {
    const product = makeProduct({ name: "Shea Butter", price: 10000 }, 0);
    const baseOrder = {
      id: "order_1",
      reference: "AERIS_TEST_REFERENCE",
      storeId: "store_1",
      items: [{ productId: product.id, name: product.name, quantity: 1, unitPrice: product.price }],
      subtotal: 10000,
      logisticsFee: 2500,
      platformFee: 500,
      merchantEarnings: 9500,
      paymentState: "paid" as const,
      delivery: { fullName: "Ada", phone: "080", address: "1 Road", city: "Lagos" as const },
      createdAt: new Date().toISOString(),
      payoutAllocated: 0
    };

    expect(availableBalance([{ ...baseOrder, status: "paid" }], [])).toBe(0);
    expect(availableBalance([{ ...baseOrder, status: "processing" }], [])).toBe(9500);
  });

  it("labels filler products as AI-generated", () => {
    expect(generateAiProducts("Beauty", 2, 1).every((product) => product.source === "ai")).toBe(true);
  });
});
