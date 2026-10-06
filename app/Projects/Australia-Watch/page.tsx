import type { Metadata } from "next";
import AustraliaWatchView from "./view";
export const metadata: Metadata = { title: "Australia Watch — A3RO Intelligence", description: "Australian macroeconomic conditions from official ABS observations." };
export default function Page() { return <AustraliaWatchView />; }
