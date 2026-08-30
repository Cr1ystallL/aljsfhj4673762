export function formatSportsKickoff(
  iso: string,
  localeTag: string,
  labels: { today: string; tomorrow: string }
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const time = d.toLocaleTimeString(localeTag, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((start - today) / 86_400_000);

  if (diffDays === 0) return `${labels.today} ${time}`;
  if (diffDays === 1) return `${labels.tomorrow} ${time}`;
  return `${d.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' })} ${time}`;
}
