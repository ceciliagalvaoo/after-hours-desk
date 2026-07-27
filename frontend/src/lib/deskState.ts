import type { DeskAppState } from "../state/AppStateContext";
import { BROKER_STATES, type BrokerDeskState } from "./brokerGrid";

/** Map the app's real state machine onto the Broker's four visual desk states. */
export function toBrokerState(s: DeskAppState): BrokerDeskState {
  switch (s) {
    case "LOADING":
      return "loading";
    case "ON_ORDER":
      return "order";
    case "ON_AUDIT":
      return "audit";
    default:
      return "ready";
  }
}

export function deskGlow(s: DeskAppState): string {
  return BROKER_STATES[toBrokerState(s)].c;
}

export function deskLabel(s: DeskAppState): string {
  return BROKER_STATES[toBrokerState(s)].label;
}
