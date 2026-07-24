import { useAppState } from "../../state/AppStateContext";
import styles from "./StateBadge.module.css";

const DOT_CLASS: Record<string, string> = {
  LOADING: styles["dot--loading"],
  READY: styles["dot--ready"],
  ON_ORDER: styles["dot--order"],
  ON_AUDIT: styles["dot--audit"],
};

const LABEL: Record<string, string> = {
  LOADING: "Office closed",
  READY: "Desk open",
  ON_ORDER: "Matching",
  ON_AUDIT: "Auditing",
};

/**
 * Always shows the REAL current `detail` string from `AppStateContext` — a tx hash, an order id,
 * a handle — never a generic "Loading..." spinner label. If `detail` is null the badge just shows
 * the state name, which is itself real (driven by real async events, see `AppStateContext.tsx`).
 */
export function StateBadge() {
  const { state, detail } = useAppState();
  return (
    <span className={styles.badge} title={detail ?? undefined}>
      <span className={`${styles.dot} ${DOT_CLASS[state] ?? ""}`} aria-hidden="true" />
      <span className={styles.label}>{LABEL[state] ?? state}</span>
      {detail && <span className={`${styles.detail} mono`}>{detail}</span>}
    </span>
  );
}
