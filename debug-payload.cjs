const safeArtist = {
    id: "12345",
    name: "Aphex Twin",
    realname: "Richard D. James",
    profile: "Electronica / IDM producer.",
    urls: ["http://aphextwin.com"],
    aliases: ["AFX", "Polygon Window"],
    images: ["http://img.com/1.jpg"],
    topReleases: [
      {
         id: "r123",
         title: "Selected Ambient Works 85-92",
         year: "1992",
         thumb: "http://img.com/thumb.jpg",
         coverImage: "http://img.com/cover.jpg",
         type: "master"
      }
    ],
    // extra fields
    provider: "discogs",
    providerItemId: "12345"
};
console.log(JSON.stringify(safeArtist));
