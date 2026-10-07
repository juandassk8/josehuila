import { useState } from 'react';

export function PageAvatar({ pageId, name, large = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const id = String(pageId || '');
  const url = /^\d{5,25}$/.test(id)
    ? `https://graph.facebook.com/${id}/picture?width=80&height=80`
    : null;

  return <span className={`adlib-avatar${large ? ' large' : ''}`} aria-hidden="true">
    {(name || 'M').slice(0, 1)}
    {url && url !== failedUrl && <img key={url} src={url} alt="" width="80" height="80"
      loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />}
  </span>;
}
