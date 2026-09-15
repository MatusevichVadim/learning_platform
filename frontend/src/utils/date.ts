// The server stores dates in UTC. Display them shifted by +3 hours
// (Europe/Minsk time zone) so the UI shows the correct local time
// regardless of the browser's own timezone setting.
export const DISPLAY_TIME_OFFSET_MS = 3 * 60 * 60 * 1000

// Format a date as dd.mm.yy (e.g. 25.08.26)
export function formatDate(input: string | Date): string {
  const d = new Date(new Date(input).getTime() + DISPLAY_TIME_OFFSET_MS)
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  return `${day}.${month}.${year}`
}

// Format a date and time as dd.mm.yy HH:MM (e.g. 25.08.26 19:14)
export function formatDateTime(input: string | Date): string {
  const d = new Date(new Date(input).getTime() + DISPLAY_TIME_OFFSET_MS)
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}.${month}.${year} ${hours}:${minutes}`
}
