import { useEffect } from "react";
import { WalletProvider, useWallet } from "./state/WalletContext";
import { AppStateProvider, useAppState } from "./state/AppStateContext";
import { TutorialProvider } from "./state/TutorialContext";
import { NetworkGuard } from "./components/layout/NetworkGuard";
import { Layout } from "./components/layout/Layout";
import { TutorialModal } from "./components/Tutorial/TutorialModal";

/**
 * Bridges real wallet-connection events into the `AppStateContext` state machine. `READY` is
 * only ever entered here in response to `status === "connected" && isCorrectChain` actually
 * becoming true — never a timer standing in for that event (see `AppStateContext.tsx`'s own
 * docstring, and the aesthetic-spec state-machine section).
 */
function AppStateBridge() {
  const { status, isCorrectChain } = useWallet();
  const { state, enterReady } = useAppState();

  useEffect(() => {
    if (status === "connected" && isCorrectChain && state === "LOADING") {
      enterReady();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only transition out of LOADING once
  }, [status, isCorrectChain]);

  return null;
}

function AppShell() {
  return (
    <>
      <AppStateBridge />
      <TutorialModal />
      <NetworkGuard>
        <Layout />
      </NetworkGuard>
    </>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <AppStateProvider>
        <TutorialProvider>
          <AppShell />
        </TutorialProvider>
      </AppStateProvider>
    </WalletProvider>
  );
}
