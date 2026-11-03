import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router";

/**
 * A page's tab, opened by `?tab=` and kept in step with it: a link — or the
 * command palette — that lands on the page already showing switches the tab
 * too. Keyed on the location, so following the same link twice still switches
 * back after the tab was changed by hand.
 */
export function useTabParam(fallback: string): [string, (tab: string) => void] {
  const [params] = useSearchParams();
  const { key } = useLocation();
  const wanted = params.get("tab") ?? fallback;
  const [tab, setTab] = useState(wanted);
  useEffect(() => {
    setTab(wanted);
  }, [wanted, key]);
  return [tab, setTab];
}
