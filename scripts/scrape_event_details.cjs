const fs = require('fs');

(async () => {
  const res = await fetch('https://www.berghain.berlin/en/program/');
  const html = await res.text();
  const eventRegex = /<a href=\"(\/en\/event\/\d+\/)\" class=\"upcoming-event[^>]*>[\s\S]*?<p[^>]*>\s*([A-Za-z]+)[\s\S]*?<span[^>]*>\s*([\d\.]+)\s*<\/span>[\s\S]*?(?:start\s*(\d{2}:\d{2}))?<\/p>[\s\S]*?<h2[^>]*style=\"color:\s*(#[0-9a-fA-F]{3,6})\"[^>]*>\s*([^<]+)\s*<\/h2>/g;
  
  let match;
  let events = [];
  while ((match = eventRegex.exec(html)) !== null) {
    events.push({
      id: match[1].split('/')[3],
      link: 'https://www.berghain.berlin' + match[1],
      day: match[2].trim(),
      date: match[3].trim(),
      time: match[4] ? match[4].trim() : '',
      color: match[5].trim(),
      title: match[6].trim().replace(/&amp;/g, '&')
    });
  }
  
  console.log('Found ' + events.length + ' events. Fetching details...');
  
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    try {
      const res = await fetch(event.link);
      const eHtml = await res.text();
      
      // Description
      const descMatch = eHtml.match(/<div class=\"text-sm md:text-md leading-relaxed content[^>]*>([\s\S]*?)<\/div>/);
      event.description = descMatch ? descMatch[1].trim() : '';
      
      // Remove HTML tags from description
      event.description = event.description.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n\s*\n/g, '\n').trim();

      // Image
      const imgMatch = eHtml.match(/<img[^>]*src=\"([^\"]+)\"[^>]*class=\"w-full border-b-1/);
      if (imgMatch) {
        event.image = imgMatch[1].startsWith('http') ? imgMatch[1] : 'https://www.berghain.berlin' + imgMatch[1];
      } else {
        const ogImageMatch = eHtml.match(/<meta property=\"og:image\" content=\"([^\"]+)\"/);
        if (ogImageMatch && !ogImageMatch[1].includes('og-image.jpg')) {
            event.image = ogImageMatch[1].startsWith('http') ? ogImageMatch[1] : 'https://www.berghain.berlin' + ogImageMatch[1];
        }
      }

      // Timetable
      event.timetable = {};
      const floorBlocks = eHtml.split(/data-set-floor=\"/);
      for (let j = 1; j < floorBlocks.length; j++) {
        const floorBlock = floorBlocks[j];
        const floorMatch = floorBlock.match(/^([^\"]+)\"/);
        if (floorMatch) {
          const floorName = floorMatch[1];
          const sets = [];
          
          const setsRaw = floorBlock.split('<li\n      data-set-item');
          for (let k = 1; k < setsRaw.length; k++) {
            const s = setsRaw[k];
            const timeMatch = s.match(/<time[^>]*>([^<]+)<\/time>/);
            const infoMatch = s.match(/class=\"running-order-set__info\">([\s\S]*?)<span\n          data-set-item-time-left/);
            
            let artist = 'Unknown';
            if (infoMatch) {
              let infoHtml = infoMatch[1];
              artist = infoHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              artist = artist.replace(/&amp;/g, '&');
            }
            
            if (timeMatch) {
              sets.push({
                time: timeMatch[1].trim(),
                artist: artist
              });
            }
          }
          if (sets.length > 0) {
            event.timetable[floorName] = sets;
          }
        }
      }
      console.log(`Fetched details for ${event.title} (${i+1}/${events.length})`);
    } catch(e) {
      console.error(`Failed to fetch details for ${event.title}`, e);
    }
  }

  const content = 'export const berghainEvents = ' + JSON.stringify(events, null, 2) + ';\n';
  fs.writeFileSync('src/data/berghainEvents.js', content);
  console.log('Saved rich events to src/data/berghainEvents.js');
})();
