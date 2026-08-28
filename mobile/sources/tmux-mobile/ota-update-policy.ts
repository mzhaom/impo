export type OtaUpdateApplyMode = "reload" | "cold-start";

export type OtaUpdatePolicy = {
  applyMode: OtaUpdateApplyMode;
  applyLabel: string;
  readyTitle: string;
  readyMessage: string;
  readyStatusLabel: string;
};

export function otaUpdatePolicy(isIosDevice: boolean): OtaUpdatePolicy {
  if (isIosDevice) {
    return {
      applyMode: "cold-start",
      applyLabel: "Restart app",
      readyTitle: "Update downloaded",
      readyMessage:
        "Fully quit AMUX, then reopen it. iOS will install the update on that cold start.",
      readyStatusLabel: "Downloaded — reopen AMUX",
    };
  }
  return {
    applyMode: "reload",
    applyLabel: "Apply",
    readyTitle: "Update ready",
    readyMessage: "A new AMUX JS bundle has downloaded. Apply it when you are ready.",
    readyStatusLabel: "Update ready to apply",
  };
}
