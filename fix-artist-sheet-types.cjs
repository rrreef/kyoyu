const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/components/ui/AlbumSheet.jsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /export function openNativeArtistFast\(artist\) \{[\s\S]*?cmd: 'open_native_artist',[\s\S]*?artist: artist[\s\S]*?\}\);/;
const replacement = `export function openNativeArtistFast(artist) {
  if (!artist) return null;
  const ts = Date.now();
  window.__lastFastOpenArtistTs = ts;
  
  // Normalize types for Swift JSONDecoder
  const safeArtist = {
    ...artist,
    id: String(artist.id || ''),
    topReleases: (artist.topReleases || []).map(r => ({
      ...r,
      id: String(r.id || ''),
      year: r.year ? String(r.year) : null
    }))
  };

  try {
    window.webkit?.messageHandlers?.player?.postMessage({
      cmd: 'open_native_artist',
      artist: safeArtist
    });`;

content = content.replace(regex, replacement);

const regexLabel = /export function openNativeLabelFast\(label\) \{[\s\S]*?cmd: 'open_native_label',[\s\S]*?label: label[\s\S]*?\}\);/;
const replacementLabel = `export function openNativeLabelFast(label) {
  if (!label) return null;
  const ts = Date.now();
  window.__lastFastOpenLabelTs = ts;

  // Normalize types for Swift JSONDecoder
  const safeLabel = {
    ...label,
    id: String(label.id || ''),
    topReleases: (label.topReleases || []).map(r => ({
      ...r,
      id: String(r.id || ''),
      year: r.year ? String(r.year) : null
    }))
  };

  try {
    window.webkit?.messageHandlers?.player?.postMessage({
      cmd: 'open_native_label',
      label: safeLabel
    });`;

content = content.replace(regexLabel, replacementLabel);

fs.writeFileSync(file, content);
console.log('Success');
