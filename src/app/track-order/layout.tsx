import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Order",
};

export default function TrackOrderLayout({ children }: LayoutProps<"/track-order">) {
  return children;
}
