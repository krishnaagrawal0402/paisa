import { Chip, type ChipTone } from "@/components/ui/chip";
import { ACCOUNT_TYPES, type Account } from "@/lib/types";

/** Small building blocks shared by the add/edit sheets. */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-muted text-xs font-medium tracking-[0.08em] uppercase">{label}</p>
      {children}
    </div>
  );
}

export function AccountChips({
  accounts,
  value,
  onChange,
  tone,
}: {
  accounts: Account[];
  value: string | null;
  onChange: (id: string) => void;
  tone: ChipTone;
}) {
  return (
    <div className="-mx-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-5 pb-1">
      {accounts.map((a) => (
        <Chip key={a.id} tone={tone} selected={value === a.id} onClick={() => onChange(a.id)}>
          <span aria-hidden>{ACCOUNT_TYPES[a.type].emoji}</span> {a.name}
        </Chip>
      ))}
    </div>
  );
}
