import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTutorial } from "../../state/TutorialContext";
import styles from "./TutorialModal.module.css";

const STEPS: { title: string; body: string }[] = [
  {
    title: "What this is",
    body:
      "A confidential OTC dark pool on Nox (iExec), live on Ethereum Sepolia. Every number here " +
      "is a real contract read or a real Nox decrypt — nothing on this screen is mocked. Order " +
      "sizes stay confidential end to end; only the matched aggregate and execution price ever " +
      "become public, and only once a batch actually settles.",
  },
  {
    title: "1. Connect a wallet",
    body:
      "Click \"Connect wallet\" and approve in MetaMask (or any injected wallet) on Ethereum " +
      "Sepolia. The public tape and Uniswap price strip already work without a wallet — " +
      "connecting unlocks submitting orders, settlement, and the auditor panel.",
  },
  {
    title: "2. No confidential balance yet?",
    body:
      "Brand-new wallet, zero cUSDC? Use \"Get testnet cUSDC\" in the order ticket — it chains " +
      "three real transactions (faucet real test-USDC, approve, wrap into confidential cUSDC) " +
      "automatically. No Etherscan needed.",
  },
  {
    title: "3. Submit an order",
    body:
      "Pick Buy or Sell, enter an amount, click \"Submit encrypted order.\" The amount is " +
      "encrypted client-side (encryptInput) before anything is sent — the transaction only ever " +
      "carries an opaque handle, never the plaintext number. Buy orders need the desk authorized " +
      "as a cUSDC operator first (one click, a short 15-minute window, never a standing grant).",
  },
  {
    title: "4. Settle the batch",
    body:
      "Once a batch has at least one buy and one sell, anyone can click \"Attempt settleBatch()\" " +
      "— there's no privileged keeper. Settlement nets the batch using composed Nox primitives and " +
      "moves real confidential cUSDC balances between traders.",
  },
  {
    title: "5. Decrypt the results",
    body:
      "After settlement, fills compute off-chain (a single TEE Runner — expect a handful of " +
      "seconds, the UI retries automatically). \"Decrypt my fill\" reveals only your own order's " +
      "fill. \"Reveal (publicDecrypt)\" on the tape's MATCH FILLED row reveals the aggregate matched " +
      "quantity and execution price — public by design, the one thing everyone gets to see.",
  },
  {
    title: "6. Auditor panel",
    body:
      "If your connected wallet is the registered compliance viewer, the Auditor Panel unlocks: " +
      "it can decrypt every fill from every trader (never a residual, never anyone's raw balance) " +
      "— a real on-chain ACL check, not a UI-only lock.",
  },
];

export function TutorialModal() {
  const { isOpen, close } = useTutorial();
  const [stepIndex, setStepIndex] = useState(0);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  function handleClose() {
    setStepIndex(0);
    close();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.head}>
              <span className={styles.eyebrow}>
                How it works · {stepIndex + 1}/{STEPS.length}
              </span>
              <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label="Close">
                ×
              </button>
            </div>
            <h2 className={styles.title}>{step.title}</h2>
            <p className={styles.body}>{step.body}</p>
            <div className={styles.dots}>
              {STEPS.map((_, i) => (
                <span key={i} className={`${styles.dot} ${i === stepIndex ? styles.dotActive : ""}`} />
              ))}
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className="ahd-btn ahd-btn--ghost"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              >
                Back
              </button>
              {isLast ? (
                <button type="button" className="ahd-btn ahd-btn--primary" onClick={handleClose}>
                  Got it — start
                </button>
              ) : (
                <button
                  type="button"
                  className="ahd-btn ahd-btn--primary"
                  onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
                >
                  Next
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
