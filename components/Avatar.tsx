export function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

export function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 65% 52%)`;
}

export function Avatar({ id, name }: { id: string; name: string }) {
  return (
    <span
      className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-inner"
      style={{ backgroundColor: colorForId(id) }}
    >
      {initials(name)}
    </span>
  );
}
