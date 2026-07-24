import { Header } from "./Header";
import { OrderTicket } from "../OrderTicket/OrderTicket";
import { Tape } from "../Tape/Tape";
import { AuditorPanel } from "../AuditorPanel/AuditorPanel";
import { UniswapPriceStrip } from "../PriceStrip/UniswapPriceStrip";
import styles from "./Layout.module.css";

export function Layout() {
  return (
    <div className={styles.shell}>
      <Header />
      <div className={styles.main}>
        <div className={styles.col}>
          <OrderTicket />
        </div>
        <div className={styles.col}>
          <UniswapPriceStrip />
          <Tape />
        </div>
      </div>
      <div className={styles.footerRow}>
        <AuditorPanel />
      </div>
    </div>
  );
}
