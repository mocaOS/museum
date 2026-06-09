"use client";

import { useEffect, useState } from "react";
import { __subscribe, getLocale, type Locale } from "./i18n";

export function useLocale(): Locale {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubscribe = __subscribe(() => setTick((n) => n + 1));
    return unsubscribe;
  }, []);
  return getLocale();
}
