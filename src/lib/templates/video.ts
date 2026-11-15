/** The link to open for a template video, at its start time when the catalog gives one. */
export function videoHref(video: { url: string; startSeconds?: number }): string {
  if (!video.startSeconds || video.startSeconds < 1) return video.url
  const url = new URL(video.url)
  url.searchParams.set('t', `${Math.floor(video.startSeconds)}s`)
  return url.toString()
}

export function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && ['www.youtube.com', 'youtube.com', 'youtu.be'].includes(u.hostname)
  } catch { return false }
}

/** `channel · Mon YYYY` for a YYYY-MM-DD upload date. */
export function videoMeta(video: { channel: string; published: string }): string {
  const [y, m] = video.published.split('-').map(Number)
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(m ?? 1) - 1] ?? ''
  return `${video.channel} · ${month} ${y}`
}
