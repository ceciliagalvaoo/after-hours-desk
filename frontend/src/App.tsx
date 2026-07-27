import { useEffect } from "react";
import { WalletProvider, useWallet } from "./state/WalletContext";
import { AppStateProvider, useAppState } from "./state/AppStateContext";
import { TutorialProvider } from "./state/TutorialContext";
import { ScreenProvider, useScreen } from "./state/ScreenContext";
import { IdentityProvider } from "./state/IdentityContext";
import { FxProvider } from "./state/FxContext";
import { TourProvider } from "./state/TourContext";
import { IntroScreen } from "./screens/IntroScreen";
import { IdentityScreen } from "./screens/IdentityScreen";
import { DeskScreen } from "./screens/DeskScreen";

/**
 * Bridges real wallet-connection events into the `AppStateContext` state machine. `READY` is only
 * ever entered here in response to `status === "connected" && isCorrectChain` actually becoming
 * true — never a timer standing in for that event.
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

function AppRouter() {
  const { screen } = useScreen();
  return (
    <>
      <AppStateBridge />
      {screen === "intro" && <IntroScreen />}
      {screen === "identity" && <IdentityScreen />}
      {screen === "desk" && <DeskScreen />}
    </>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <AppStateProvider>
        <TutorialProvider>
          <ScreenProvider>
            <IdentityProvider>
              <FxProvider>
                <TourProvider>
                  <AppRouter />
                </TourProvider>
              </FxProvider>
            </IdentityProvider>
          </ScreenProvider>
        </TutorialProvider>
      </AppStateProvider>
    </WalletProvider>
  );
}
