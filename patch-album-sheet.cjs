const fs = require('fs');
const file = '/Users/p33/Desktop/ANTIGRAVITY PROJECTS/KYOYU/kyoyu-app/src/components/ui/AlbumSheet.jsx';
let content = fs.readFileSync(file, 'utf8');

const additions = `
export function openNativeArtistFast(artist) {
  if (!artist) return null;
  const ts = Date.now();
  window.__lastFastOpenArtistTs = ts;
  try {
    window.webkit?.messageHandlers?.player?.postMessage({
      cmd: 'open_native_artist',
      artist: artist
    });
  } catch (e) { console.error('Failed to open native artist sheet', e); }
  return artist;
}

export function openNativeLabelFast(label) {
  if (!label) return null;
  const ts = Date.now();
  window.__lastFastOpenLabelTs = ts;
  try {
    window.webkit?.messageHandlers?.player?.postMessage({
      cmd: 'open_native_label',
      label: label
    });
  } catch (e) { console.error('Failed to open native label sheet', e); }
  return label;
}
`;

content = content + additions;
fs.writeFileSync(file, content);
console.log('Success');
