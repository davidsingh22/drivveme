import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

export default function ProfileDebugInfo({ userId }: { userId?: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const Row = ({ label, value }: { label: string; value: string | null }) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="font-mono text-xs break-all">{value ?? "—"}</p>
      </div>
      {value && (
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(value, label)}>
          {copied === label ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </Button>
      )}
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1.5 text-xs">
      <p className="font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Debug</p>
      <Row label="User UID" value={userId ?? null} />
    </div>
  );
}