const fs = require('fs');
const { PNG } = require('pngjs');

function makeTransparent(filename) {
    const data = fs.readFileSync(filename);
    const png = PNG.sync.read(data);
    
    // Assume pixel (0,0) is the background color
    const idx0 = 0;
    const bgR = png.data[idx0];
    const bgG = png.data[idx0+1];
    const bgB = png.data[idx0+2];
    
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            let idx = (png.width * y + x) << 2;
            
            let r = png.data[idx];
            let g = png.data[idx+1];
            let b = png.data[idx+2];
            
            // If it perfectly matches the background, make it transparent
            // (Or we can do a tolerance)
            if (Math.abs(r-bgR) < 10 && Math.abs(g-bgG) < 10 && Math.abs(b-bgB) < 10) {
                png.data[idx+3] = 0; // Alpha 0
            } else {
                png.data[idx+3] = 255;
            }
        }
    }
    
    const out = PNG.sync.write(png);
    fs.writeFileSync(filename, out);
    console.log('Fixed', filename);
}

makeTransparent('/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/Assets.xcassets/bandcamp_light_24x24.imageset/bandcamp_light_24x24.png');
makeTransparent('/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/Assets.xcassets/soundcloud_light_24x24.imageset/soundcloud_light_24x24.png');
makeTransparent('/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/Assets.xcassets/youtube_light_24x24.imageset/youtube_light_24x24.png');
