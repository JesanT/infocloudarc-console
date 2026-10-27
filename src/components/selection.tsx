import { useState } from "react";
import { Button } from "@/components/ui";

export function useSelection(ids: string[]) {
  const [picked, setPicked] = useState<string[]>([]);
  const chosen = picked.filter((id) => ids.includes(id));
  const all = ids.length > 0 && ids.every((id) => picked.includes(id));

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAll() {
    setPicked(all ? picked.filter((id) => !ids.includes(id)) : [...new Set([...picked, ...ids])]);
  }

  return { picked: chosen, all, toggle, toggleAll, clear: () => setPicked([]), has: (id: string) => picked.includes(id) };
}

export function SelectBox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      className="size-4 accent-[#0078d4]"
      checked={checked}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onChange={onChange}
    />
  );
}

export function rowClass(selected: boolean) {
  return selected ? "cursor-pointer bg-[#deecf9]" : "cursor-pointer hover:bg-[#faf9f8]";
}

export function SelectionBar({
  count,
  onEdit,
  onDelete,
  onClear,
}: {
  count: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 border border-[#c7e0f4] bg-[#f3f9fd] px-3 py-2 text-sm">
      <span className="font-semibold text-ink">{count} selected</span>
      {onEdit && <Button onClick={onEdit}>Edit</Button>}
      {onDelete && <Button variant="danger" onClick={onDelete}>Delete</Button>}
      <Button onClick={onClear}>Clear</Button>
    </div>
  );
}
