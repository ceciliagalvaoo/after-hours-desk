import { AnimatePresence, motion } from "framer-motion";
import styles from "./RedactedValue.module.css";

interface RedactedValueProps {
  /** Whether the real value is currently decrypted/known and should be shown. */
  revealed: boolean;
  /** The real text to render once `revealed` is true. */
  revealedText: string;
  /**
   * Rendered underneath the redaction bar even while hidden — per the Confidential-Noir spec,
   * `███` must always sit on top of a REAL value that exists (a fetched handle), never stand in
   * for data that was never fetched. Callers pass a short form of the actual on-chain handle
   * here, never a hardcoded placeholder.
   */
  underlyingHandleText?: string;
  className?: string;
  title?: string;
}

/**
 * The recurring "redaction bar" motif. The real (short) handle is always literally present in
 * the DOM underneath the bar overlay — inspect-element on stage during a demo shows a real
 * `0x...` handle, not a decorative string. Only `revealed` (driven by a real `decrypt`/
 * `publicDecrypt` resolving) swaps the bar out for the actual plaintext value.
 */
export function RedactedValue({
  revealed,
  revealedText,
  underlyingHandleText,
  className,
  title,
}: RedactedValueProps) {
  return (
    <span className={`${styles.redacted} mono ${className ?? ""}`} title={title}>
      <span className={`${styles.real} ${revealed ? styles["real--revealed"] : ""}`}>
        {revealed ? revealedText : underlyingHandleText ?? "—"}
      </span>
      <AnimatePresence>
        {!revealed && (
          <motion.span
            className={styles.bar}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            aria-hidden="true"
          >
            ██████
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
