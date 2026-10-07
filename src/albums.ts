import content from "../content/albums.json" with { type: "json" };
import { escapeHtml } from "./html";
import { assetUrl } from "./asset-url";

export type Album = {
  id: string;
  title: string;
  artist: string;
  releaseDate: string;
  label: string;
  publisher: string;
  type: string;
  catalogNumber: string;
  cover: string;
  description: string;
  sourceUrl: string;
  trackSourceUrl: string;
  listenUrl: string;
  tracks: { number: number; title: string; artist: string; note: string }[];
};
export type AlbumMonth = { monthId: string; albumId: string | null };
export const albumMonths = content.months as AlbumMonth[];
export const albumCatalog = content.albums as Album[];
export const albumForMonth = (index: number) => albumCatalog.find(album => album.id === albumMonths[index]?.albumId);

export function albumTrackMarkup(album?: Album, playable?: (index: number) => boolean) {
  if (!album) return '<div class="album-pending"><span>AWAITING ALBUM</span><h3>这张专辑等待你提供</h3><p>封面、介绍和正式曲目表会一起放入本月的 CD 盒。</p></div>';
  return `<div class="album-track-head"><span>DISC 01</span><b>${album.tracks.length} TRACKS</b></div><ol class="album-tracks">${album.tracks.map((track, index) => {
    const available = playable?.(index);
    const content = `<span class="album-track-number">${String(track.number).padStart(2, "0")}</span><div><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></div><span class="album-track-note">${escapeHtml(track.note)}</span>`;
    return `<li data-track="${track.number}">${playable ? `<button class="booklet-track" data-action="booklet-track" data-track-index="${index}" aria-label="播放 ${escapeHtml(track.title)}" aria-pressed="false" ${available ? "" : "disabled"}>${content}<span class="booklet-track-state">${available ? "▶ 播放" : "暂无音频"}</span></button>` : content}</li>`;
  }).join("")}</ol><div class="album-source"><a href="${escapeHtml(album.trackSourceUrl)}" target="_blank" rel="noopener">官方曲目表 ↗</a><small>CD 曲序</small></div>`;
}

export function albumDescriptionMarkup(album?: Album) {
  if (!album) return albumTrackMarkup();
  return `<div class="album-description"><img src="${assetUrl(album.cover)}" alt="${escapeHtml(album.title)}专辑封面"/><div><h3>${escapeHtml(album.title)}</h3><p>${escapeHtml(album.description)}</p><dl><div><dt>发行公司</dt><dd>${escapeHtml(album.publisher)}</dd></div><div><dt>厂牌</dt><dd>${escapeHtml(album.label)}</dd></div><div><dt>发行日期</dt><dd>${album.releaseDate}</dd></div><div><dt>专辑类别</dt><dd>${escapeHtml(album.type)}</dd></div><div><dt>CD 编号</dt><dd>${album.catalogNumber}</dd></div></dl><a class="album-official-link" href="${escapeHtml(album.sourceUrl)}" target="_blank" rel="noopener">发行方专辑介绍 ↗</a></div></div>`;
}
