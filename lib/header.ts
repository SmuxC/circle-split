// Per-route entries for the mobile header.
//   - `label`: text centered in the bar.
//   - `back`: optional href for a chevron back button on the left. Omit to
//     hide the chevron (and fall back to the logo).
export type BackBarEntry = {
  label: string;
  back?: string;
};

export const BACK_BAR: Record<string, BackBarEntry> = {
  // /new uses a dedicated pill component in the bar instead of a label —
  // handled in Header.tsx; no entry needed here.
};
