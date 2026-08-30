'use client';

import { ExternalLink } from 'lucide-react';
import { useT } from '@/i18n/use-t';

type StreamKind = 'twitch' | 'youtube' | 'kick';

function parseStream(url: string): { kind: StreamKind; id: string } | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'twitch.tv' || host === 'player.twitch.tv') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const fromQuery = parsed.searchParams.get('channel');
      const channel =
        fromQuery ||
        (parts[0]?.toLowerCase() === 'popout' || parts[0]?.toLowerCase() === 'embed'
          ? parts[1]
          : parts[0]);
      if (channel && /^[a-zA-Z0-9_]{2,25}$/.test(channel)) {
        return { kind: 'twitch', id: channel };
      }
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
      const id =
        parsed.searchParams.get('v') ||
        (host === 'youtu.be' ? parsed.pathname.split('/').filter(Boolean)[0] : undefined) ||
        (parsed.pathname.startsWith('/live/') || parsed.pathname.startsWith('/embed/')
          ? parsed.pathname.split('/')[2]
          : undefined);
      if (id && /^[a-zA-Z0-9_-]{6,}$/.test(id)) {
        return { kind: 'youtube', id };
      }
    }
    if (host === 'kick.com') {
      const channel = parsed.pathname.split('/').filter(Boolean)[0];
      if (channel && /^[a-zA-Z0-9_]{2,25}$/.test(channel)) {
        return { kind: 'kick', id: channel };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function embedSrc(url: string): string | null {
  const stream = parseStream(url);
  if (!stream) return null;
  if (stream.kind === 'twitch') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'macvbet.com';
    const parents = [...new Set([host, 'macvbet.com', 'web.telegram.org'])];
    return `https://player.twitch.tv/?channel=${stream.id}&${parents
      .map((p) => `parent=${encodeURIComponent(p)}`)
      .join('&')}&muted=true`;
  }
  if (stream.kind === 'youtube') {
    return `https://www.youtube.com/embed/${stream.id}?rel=0`;
  }
  return `https://player.kick.com/${stream.id}`;
}

export function LiveStreamPlayer({ url, title }: { url: string; title?: string }) {
  const { t } = useT();
  const src = embedSrc(url);
  if (!src) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
      <div className="relative w-full aspect-video">
        <iframe
          src={src}
          title={title || t('sports.streamLive')}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 font-roobert text-[10px] text-whisper-gray hover:text-frost-white"
      >
        <ExternalLink size={11} strokeWidth={2} />
        {t('sports.watchStream')}
      </a>
    </div>
  );
}
