import { format, isToday, isYesterday } from "date-fns";
import { uz } from "date-fns/locale";

export function safeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "file";
}

export function timeLabel(value: string | null) {
  if (!value) return "";
  return format(new Date(value), "HH:mm");
}

export function dateLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (isToday(date)) return "Bugun";
  if (isYesterday(date)) return "Kecha";
  return format(date, "d MMMM", { locale: uz });
}

export function shouldGroup(previousSenderId?: string, currentSenderId?: string, previousDate?: string | null, currentDate?: string | null) {
  if (!previousSenderId || !currentSenderId || previousSenderId !== currentSenderId || !previousDate || !currentDate) return false;
  return Math.abs(new Date(currentDate).getTime() - new Date(previousDate).getTime()) < 4 * 60 * 1000;
}

/** "Oxirgi faollik 18:24" / "kecha 21:10" / "12 sen 09:00" — empty when unknown. */
export function lastSeenLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (Date.now() - date.getTime() < 60 * 1000) return "Hozirgina faol edi";
  if (isToday(date)) return `Oxirgi faollik ${format(date, "HH:mm")}`;
  if (isYesterday(date)) return `Kecha ${format(date, "HH:mm")} da faol edi`;
  return `Oxirgi faollik ${format(date, "d MMM", { locale: uz })}`;
}

/** Home list timestamp: time today, "Kecha", else a short date. */
export function listTimeLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Kecha";
  return format(date, "d MMM", { locale: uz });
}
