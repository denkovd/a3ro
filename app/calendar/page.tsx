import type { Metadata } from "next";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";
import CalendarView from "./CalendarView";

export const metadata: Metadata = {
  title: "Calendar — A3RO Intelligence",
  description: "Upcoming Australian data releases, RBA and Fed decisions, and the global economic calendar.",
};

export default function CalendarPage() {
  return <main className="relative min-h-screen">
    <Nav />
    <CalendarView />
    <SiteFooter />
  </main>;
}
