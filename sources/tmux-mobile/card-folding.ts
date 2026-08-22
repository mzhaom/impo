export type CardFoldingPlatform = {
  os: string;
  isPad?: boolean;
  isVision?: boolean;
  visionDeviceDetected?: boolean;
};

/** Compact accordion cards are an iPhone-only presentation. */
export function shouldFoldSessionCards(platform: CardFoldingPlatform): boolean {
  return (
    platform.os === "ios" &&
    !platform.isPad &&
    !platform.isVision &&
    !platform.visionDeviceDetected
  );
}
