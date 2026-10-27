"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  price: number;
  image: string;
  size: string;
  color: string;
  quantity: number;
  maxQuantity: number;
};

type CartState = {
  items: CartItem[];
  discount: { code: string; amount: number; display?: string } | null;
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  setQty: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  setDiscount: (discount: CartState["discount"]) => void;
  clear: () => void;
};

export const itemKey = (i: { variantId: string }) => i.variantId;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      discount: null,
      add: (item, quantity = 1) =>
        set((state) => {
          const key = itemKey(item);
          const existing = state.items.find((i) => itemKey(i) === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                itemKey(i) === key
                  ? { ...i, quantity: Math.min(i.quantity + quantity, i.maxQuantity) }
                  : i,
              ),
            };
          }
          return {
            items: [...state.items, { ...item, quantity: Math.min(quantity, item.maxQuantity) }],
          };
        }),
      setQty: (key, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => itemKey(i) !== key)
              : state.items.map((i) =>
                  itemKey(i) === key ? { ...i, quantity: Math.min(quantity, i.maxQuantity) } : i,
                ),
        })),
      remove: (key) =>
        set((state) => ({ items: state.items.filter((i) => itemKey(i) !== key) })),
      setDiscount: (discount) => set({ discount }),
      clear: () => set({ items: [], discount: null }),
    }),
    { name: "drop-cart-v2" },
  ),
);
