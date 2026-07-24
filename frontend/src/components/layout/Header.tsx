import { useWallet } from "../../state/WalletContext";
import { useAppState } from "../../state/AppStateContext";
import { useTutorial } from "../../state/TutorialContext";
import { shortAddress } from "../../lib/format";
import { Broker } from "../mascot/Broker";
import { StateBadge } from "../common/StateBadge";
import styles from "./Header.module.css";

export function Header() {
  const { account, disconnect } = useWallet();
  const { state } = useAppState();
  const tutorial = useTutorial();

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.mascotSmall}>
          <Broker state={state} caption="" />
        </div>
        <div className={styles.brandText}>
          <h1>After Hours Desk</h1>
          <p>Confidential dark pool · Nox (iExec) · Ethereum Sepolia</p>
        </div>
      </div>
      <div className={styles.right}>
        <button type="button" className="ahd-btn ahd-btn--ghost" onClick={tutorial.open}>
          How it works
        </button>
        <StateBadge />
        {account && (
          <>
            <span className={`${styles.account} mono`} title={account}>
              {shortAddress(account)}
            </span>
            <button type="button" className="ahd-btn ahd-btn--ghost" onClick={disconnect}>
              Disconnect
            </button>
          </>
        )}
      </div>
    </header>
  );
}
