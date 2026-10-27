"use client";

import { createContext, useContext } from "react";
import type { DisplayCurrency } from "@/lib/price-format";

const CurrencyContext = createContext<DisplayCurrency>({
  code: "usd",
  name: "US Dollar",
  symbol: "$",
  rate: 1,
  decimals: 2,
});

export function CurrencyProvider({
  currency,
  children,
}: {
  currency: DisplayCurrency;
  children: React.ReactNode;
}) {
  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
