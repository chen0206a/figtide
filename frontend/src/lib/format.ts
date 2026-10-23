const pad = (n: number) => String(n).padStart(2, "0");
export function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function formatDate(iso: string, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.getFullYear() === now.getFullYear()
    ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
    : formatDateTime(iso).slice(0, 10);
}
