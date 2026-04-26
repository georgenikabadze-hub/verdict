import { InstallerMarketplace } from "@/components/installer/InstallerMarketplace";
import { listLeads } from "@/lib/leads/store";

export default function InstallerPage() {
  return (
    <InstallerMarketplace
      initialLeads={listLeads()}
      mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
    />
  );
}
