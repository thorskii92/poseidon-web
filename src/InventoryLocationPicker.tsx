import { useLocations } from "./inventoryShared";

/**
 * A storehouse dropdown. Shown only when there is more than one storehouse —
 * with one, everything simply happens there.
 */
export function LocationPicker({
  label, value, onChange,
}: {
  label: string;
  value: number;
  onChange: (id: number) => void;
}) {
  const { active, defaultId } = useLocations();
  if (active.length < 2) return null;
  return (
    <label className="field-input">
      <span>{label}</span>
      <select value={value || defaultId} onChange={(e) => onChange(Number(e.target.value))}>
        {active.map((l) => (
          <option key={l.id} value={l.id}>{l.name}{l.isDefault ? " (default)" : ""}</option>
        ))}
      </select>
    </label>
  );
}
