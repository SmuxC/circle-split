// Per-route back-bar entries for the mobile header.
// Key: pathname. Value: label shown next to the chevron + href the chevron returns to.
export type BackBarEntry = {
  label: string;
  back: string;
};

export const BACK_BAR: Record<string, BackBarEntry> = {
  "/new": { label: "Split & request", back: "/" },
};
