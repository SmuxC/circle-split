import {
  IconAffiliateFilled,
  IconCirclePlusFilled,
  IconDotsFilled,
  IconHomeFilled,
  IconReceiptEuroFilled,
  type Icon,
} from "@tabler/icons-react";

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: IconHomeFilled },
  { href: "/groups", label: "Groups", icon: IconAffiliateFilled },
  { href: "/new", label: "New", icon: IconCirclePlusFilled },
  { href: "/bills", label: "Bills", icon: IconReceiptEuroFilled },
  { href: "/more", label: "More", icon: IconDotsFilled },
];
