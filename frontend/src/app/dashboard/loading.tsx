import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div
      className="flex h-64 items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
    </div>
  );
}
