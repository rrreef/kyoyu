// =============================================
// KYO — Mock Data
// =============================================

export const artists = [
  {
    id: 'aura-system',
    name: 'Aura System',
    genre: 'Techno / Electronic',
    photo: '/artist1.svg',
    bio: 'Berlin-based electronic music producer and DJ known for hypnotic, hardware-driven techno. Resident at iconic underground venues across Europe. Three studio albums on Obsidian Records.',
    followers: 42800,
    monthlyListeners: 138000,
    verified: true,
    label: 'obsidian-records',
    location: 'Berlin, Germany',
    events: [
      { venue: 'Fabric London', date: '2026-05-03', city: 'London' },
      { venue: 'Tresor', date: '2026-05-17', city: 'Berlin' },
      { venue: 'De School', date: '2026-06-08', city: 'Amsterdam' },
    ],
    tags: ['techno', 'electronic', 'ambient', 'dark'],
  },
  {
    id: 'marcus-cole',
    name: 'Marcus Cole',
    genre: 'Jazz / Contemporary',
    photo: '/artist2.svg',
    bio: 'Pianist and composer. Former bandleader of the Marcus Cole Quartet. Four decades of recordings spanning post-bop, modal jazz, and contemporary classical fusion. Releases through Quiet Storm Jazz.',
    followers: 28400,
    monthlyListeners: 89000,
    verified: true,
    label: 'quiet-storm-jazz',
    location: 'New York, USA',
    events: [
      { venue: 'Village Vanguard', date: '2026-04-28', city: 'New York' },
      { venue: 'Ronnie Scott\'s', date: '2026-05-12', city: 'London' },
    ],
    tags: ['jazz', 'piano', 'modal', 'post-bop'],
  },
  {
    id: 'nebulous-state',
    name: 'Nebulous State',
    genre: 'Ambient / Drone',
    photo: '/album6.png',
    bio: 'Duo project exploring the intersection of ambient music, field recordings, and minimal composition. Releases on limited-edition vinyl through their own imprint.',
    followers: 19200,
    monthlyListeners: 54000,
    verified: false,
    label: 'self-released',
    location: 'Paris, France',
    events: [],
    tags: ['ambient', 'drone', 'field-recording', 'experimental'],
  },
  {
    id: 'klyde',
    name: 'Klyde',
    genre: 'Hip-Hop / Underground',
    photo: '/album5.png',
    bio: 'Underground MC and producer from Lyon. Raw, poetic, cinematic rap. Known for self-produced beats and sharply written bars. Multiple projects released via Bandcamp and KYO.',
    followers: 31600,
    monthlyListeners: 112000,
    verified: true,
    label: 'rare-sounds',
    location: 'Lyon, France',
    events: [
      { venue: 'La Cigale', date: '2026-05-25', city: 'Paris' },
    ],
    tags: ['hip-hop', 'underground', 'rap', 'boom-bap'],
  },
];

export const labels = [
  {
    id: 'obsidian-records',
    name: 'Obsidian Records',
    logo: '/label1.svg',
    genre: 'Techno / Electronic',
    location: 'Berlin, Germany',
    founded: 2014,
    catalog: 'OBS-001 to OBS-089',
    bio: 'Berlin-based independent label releasing cutting-edge techno, ambient, and experimental electronic music. Known for high-quality vinyl pressings and meticulous sound design.',
    followers: 18400,
    vinylAvailable: true,
    artists: ['aura-system'],
  },
  {
    id: 'quiet-storm-jazz',
    name: 'Quiet Storm Jazz',
    logo: '/artist2.svg',
    genre: 'Jazz / Contemporary',
    location: 'New York, USA',
    founded: 1991,
    catalog: 'QSJ-001 to QSJ-214',
    bio: 'Legendary New York jazz imprint with over three decades of recordings. Catalog spans from hard bop to contemporary jazz improvisations.',
    followers: 12800,
    vinylAvailable: true,
    artists: ['marcus-cole'],
  },
  {
    id: 'rare-sounds',
    name: 'Rare Sounds',
    logo: '/album5.png',
    genre: 'Hip-Hop / Underground',
    location: 'Lyon, France',
    founded: 2019,
    catalog: 'RS-001 to RS-022',
    bio: 'Independent hip-hop imprint from Lyon championing underground rap, boom-bap, and instrumental production.',
    followers: 8900,
    vinylAvailable: false,
    artists: ['klyde'],
  },
];

export const releases = [
  {
    id: 'void-sequence',
    title: 'Void Sequence',
    artist: 'Aura System',
    artistId: 'aura-system',
    label: 'Obsidian Records',
    labelId: 'obsidian-records',
    cover: '/album1.png',
    year: 2025,
    catalogNumber: 'OBS-087',
    genre: 'Techno',
    formats: ['Digital', 'Vinyl 12"'],
    vinylPrice: 18.50,
    downloadPrice: 1.20,
    duration: '58:32',
    tags: ['techno', 'dark', 'hypnotic'],
    credits: {
      producer: 'Aura System',
      recordedAt: 'Studio OBS, Berlin',
      mastering: 'Karl Heinz (Dubplates & Mastering)',
      artwork: 'M. Stark',
    },
    tracks: [
      { id: 't1', title: 'Phase Gate', duration: '7:12', bpm: 138, key: 'A min' },
      { id: 't2', title: 'Subgrid', duration: '8:44', bpm: 140, key: 'D min' },
      { id: 't3', title: 'Residual Current', duration: '9:02', bpm: 136, key: 'E min' },
      { id: 't4', title: 'Null Space', duration: '6:55', bpm: 142, key: 'C min' },
      { id: 't5', title: 'Transmission Fault', duration: '8:18', bpm: 138, key: 'G min' },
      { id: 't6', title: 'Carrier Wave', duration: '9:44', bpm: 135, key: 'B min' },
      { id: 't7', title: 'Void Sequence', duration: '8:37', bpm: 140, key: 'F min' },
    ],
    description: 'A seven-track exploration of industrial rhythm systems and dark harmonic tension. Recorded live to tape across three sessions in Berlin.',
    streamCount: 284000,
    vinylSold: 340,
  },
  {
    id: 'lunar-drift',
    title: 'Lunar Drift',
    artist: 'Nebulous State',
    artistId: 'nebulous-state',
    label: 'Self-Released',
    labelId: 'self-released',
    cover: '/album2.png',
    year: 2025,
    catalogNumber: 'NS-004',
    genre: 'Ambient',
    formats: ['Digital', 'Vinyl LP'],
    vinylPrice: 22.00,
    downloadPrice: 1.00,
    duration: '48:15',
    tags: ['ambient', 'minimal', 'space', 'drone'],
    credits: {
      producer: 'Nebulous State',
      recordedAt: 'Studio Fantôme, Paris',
      mastering: 'S. Arnaud (Studio Fantôme)',
      artwork: 'Nebulous State',
    },
    tracks: [
      { id: 't8', title: 'Perigee', duration: '12:04', bpm: null, key: 'Open' },
      { id: 't9', title: 'Apogee', duration: '9:58', bpm: null, key: 'Open' },
      { id: 't10', title: 'Selenography', duration: '14:22', bpm: null, key: 'Open' },
      { id: 't11', title: 'Terminator Line', duration: '11:51', bpm: null, key: 'Open' },
    ],
    description: "Fifty minutes of deep spatial synthesis recorded during a residency in rural Brittany. Lunar Drift is Nebulous State's most expansive work to date.",
    streamCount: 96000,
    vinylSold: 180,
  },
  {
    id: 'echo-chamber',
    title: 'Echo Chamber',
    artist: 'Void Rhythm',
    artistId: 'aura-system',
    label: 'Obsidian Records',
    labelId: 'obsidian-records',
    cover: '/album3.png',
    year: 2024,
    catalogNumber: 'OBS-079',
    genre: 'Minimal Techno',
    formats: ['Vinyl 12"'],
    vinylPrice: 15.00,
    downloadPrice: 1.10,
    duration: '26:30',
    tags: ['minimal', 'techno', 'hypnotic', 'geometric'],
    credits: {
      producer: 'Aura System',
      recordedAt: 'Studio OBS, Berlin',
      mastering: 'Karl Heinz',
      artwork: 'Aura System',
    },
    tracks: [
      { id: 't12', title: 'Echo Chamber (Side A)', duration: '13:15', bpm: 128, key: 'A min' },
      { id: 't13', title: 'Return Signal (Side B)', duration: '13:15', bpm: 128, key: 'A min' },
    ],
    description: 'Two tracks, one idea. A hypnotic loop system designed for extended play on the dancefloor.',
    streamCount: 154000,
    vinylSold: 560,
  },
  {
    id: 'night-motion',
    title: 'Night Motion',
    artist: 'Marcus Cole Quartet',
    artistId: 'marcus-cole',
    label: 'Quiet Storm Jazz',
    labelId: 'quiet-storm-jazz',
    cover: '/album4.png',
    year: 2024,
    catalogNumber: 'QSJ-214',
    genre: 'Jazz',
    formats: ['Digital', 'CD', 'Vinyl LP'],
    vinylPrice: 26.00,
    downloadPrice: 1.30,
    duration: '54:08',
    tags: ['jazz', 'saxophone', 'live', 'post-bop'],
    credits: {
      producer: 'Marcus Cole',
      recordedAt: 'Van Gelder Studio, Englewood Cliffs NJ',
      mastering: 'T. Henderson',
      artwork: 'Photo by J. Williams',
    },
    tracks: [
      { id: 't14', title: 'Night Motion', duration: '8:24', bpm: null, key: 'Eb maj' },
      { id: 't15', title: 'Southpaw', duration: '7:11', bpm: null, key: 'F min' },
      { id: 't16', title: 'Three in the Morning', duration: '10:02', bpm: null, key: 'Bb min' },
      { id: 't17', title: 'The Line Between', duration: '9:28', bpm: null, key: 'D maj' },
      { id: 't18', title: 'Closure', duration: '6:44', bpm: null, key: 'G min' },
      { id: 't19', title: 'Open Sky', duration: '12:19', bpm: null, key: 'Open' },
    ],
    description: 'Recorded live at Van Gelder Studio in a single day. The quartet at the peak of its form.',
    streamCount: 208000,
    vinylSold: 290,
  },
  {
    id: 'night-shifts',
    title: 'Night Shifts',
    artist: 'Klyde',
    artistId: 'klyde',
    label: 'Rare Sounds',
    labelId: 'rare-sounds',
    cover: '/album5.png',
    year: 2025,
    catalogNumber: 'RS-022',
    genre: 'Hip-Hop',
    formats: ['Digital'],
    vinylPrice: null,
    downloadPrice: 1.00,
    duration: '38:14',
    tags: ['hip-hop', 'underground', 'storytelling', 'boom-bap'],
    credits: {
      producer: 'Klyde',
      recordedAt: 'Studio Maison, Lyon',
      mastering: 'H. Perrin',
      artwork: 'Klyde',
    },
    tracks: [
      { id: 't20', title: 'First Shift', duration: '3:12', bpm: 88, key: 'C min' },
      { id: 't21', title: 'Nuit Blanche', duration: '4:02', bpm: 92, key: 'F min' },
      { id: 't22', title: 'Métro Minuit', duration: '3:44', bpm: 85, key: 'A min' },
      { id: 't23', title: 'Klyde Talk', duration: '2:55', bpm: 90, key: 'G min' },
      { id: 't24', title: 'Interlude 1', duration: '1:30', bpm: null, key: null },
      { id: 't25', title: 'Second Shift', duration: '4:18', bpm: 94, key: 'D min' },
      { id: 't26', title: 'Concrete', duration: '3:56', bpm: 87, key: 'Bb min' },
      { id: 't27', title: 'Lyon 3h', duration: '4:28', bpm: 89, key: 'E min' },
      { id: 't28', title: 'Last Shift', duration: '5:12', bpm: 91, key: 'C min' },
      { id: 't29', title: 'Outro', duration: '4:57', bpm: null, key: null },
    ],
    description: 'A concept album about night work — both the literal job and the creative grind. Self-produced entirely in Klyde\'s home studio between midnight shifts.',
    streamCount: 342000,
    vinylSold: 0,
  },
  {
    id: 'orbital-echoes',
    title: 'Orbital Echoes',
    artist: 'Nebulous State',
    artistId: 'nebulous-state',
    label: 'Self-Released',
    labelId: 'self-released',
    cover: '/album6.png',
    year: 2023,
    catalogNumber: 'NS-003',
    genre: 'Ambient',
    formats: ['Digital', 'Vinyl LP'],
    vinylPrice: 20.00,
    downloadPrice: 1.00,
    duration: '44:20',
    tags: ['ambient', 'cinematic', 'rain', 'meditative'],
    credits: {
      producer: 'Nebulous State',
      recordedAt: 'Mobile recording — various locations',
      mastering: 'S. Arnaud',
      artwork: 'Nebulous State',
    },
    tracks: [
      { id: 't30', title: 'First Contact', duration: '11:12', bpm: null, key: 'Open' },
      { id: 't31', title: 'Signal', duration: '9:34', bpm: null, key: 'Open' },
      { id: 't32', title: 'Return', duration: '13:08', bpm: null, key: 'Open' },
      { id: 't33', title: 'Silence Protocol', duration: '10:26', bpm: null, key: 'Open' },
    ],
    description: 'Field recordings from three countries, processed and composed into a single continuous journey.',
    streamCount: 71000,
    vinylSold: 142,
  },

  // ── ROCK / INDIE (10) ──
  { id: 'fault-lines', title: 'Fault Lines', artist: 'Modern Wolf', artistId: 'aura-system', label: 'Self-Released', labelId: 'self-released', cover: '/album_r1.svg', year: 2024, catalogNumber: 'MW-001', genre: 'Alternative Rock', formats: ['Digital', 'Vinyl LP'], vinylPrice: 21.00, downloadPrice: 1.20, duration: '44:10', tags: ['alternative', 'rock', 'dark'], credits: { producer: 'Modern Wolf', recordedAt: 'Studio X, London', mastering: 'J. Park', artwork: 'M. Wolf' }, tracks: [ { id: 'mw1', title: 'Fault Lines', duration: '4:12', bpm: 120, key: 'E min' }, { id: 'mw2', title: 'Red Signal', duration: '3:58', bpm: 118, key: 'A min' }, { id: 'mw3', title: 'Collapse', duration: '5:02', bpm: 115, key: 'D min' }, { id: 'mw4', title: 'Glass Echo', duration: '4:44', bpm: 122, key: 'G min' }, { id: 'mw5', title: 'Distance', duration: '3:55', bpm: 108, key: 'C min' }, { id: 'mw6', title: 'Overload', duration: '4:28', bpm: 125, key: 'F min' }, { id: 'mw7', title: 'Slow Burn', duration: '5:10', bpm: 100, key: 'B min' }, { id: 'mw8', title: 'Static', duration: '3:40', bpm: 130, key: 'E min' }, { id: 'mw9', title: 'After the Fall', duration: '4:55', bpm: 112, key: 'A min' }, { id: 'mw10', title: 'Aftershock', duration: '4:22', bpm: 116, key: 'D min' } ], description: 'Ten tracks carved from tension and release. A debut album that refuses to settle.', streamCount: 142000, vinylSold: 210 },

  { id: 'signal-noise', title: 'Signal Noise', artist: 'Pale Arcade', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_r2.svg', year: 2025, catalogNumber: 'PA-002', genre: 'Shoegaze', formats: ['Digital', 'Vinyl LP'], vinylPrice: 23.00, downloadPrice: 1.10, duration: '52:30', tags: ['shoegaze', 'dream pop', 'reverb'], credits: { producer: 'Pale Arcade', recordedAt: 'Home studio, Manchester', mastering: 'A. Bloom', artwork: 'Pale Arcade' }, tracks: [ { id: 'pa1', title: 'Signal Noise', duration: '6:20', bpm: null, key: 'Open' }, { id: 'pa2', title: 'Drift', duration: '5:44', bpm: null, key: 'Open' }, { id: 'pa3', title: 'Haze', duration: '7:02', bpm: null, key: 'Open' }, { id: 'pa4', title: 'Pale', duration: '5:55', bpm: null, key: 'Open' }, { id: 'pa5', title: 'Arcade Dreams', duration: '6:12', bpm: null, key: 'Open' }, { id: 'pa6', title: 'Scatter', duration: '8:10', bpm: null, key: 'Open' }, { id: 'pa7', title: 'White Room', duration: '7:07', bpm: null, key: 'Open' } ], description: 'Layered guitar walls and soft vocals as a form of erasure. Immersive and deliberately disorienting.', streamCount: 88000, vinylSold: 155 },

  { id: 'harbour-light', title: 'Harbour Light', artist: 'The Crestline', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_r3.svg', year: 2023, catalogNumber: 'QSJ-200', genre: 'Post-Rock', formats: ['Digital', 'Vinyl LP'], vinylPrice: 24.00, downloadPrice: 1.00, duration: '49:20', tags: ['post-rock', 'instrumental', 'cinematic'], credits: { producer: 'The Crestline', recordedAt: 'Studio Nord, Hamburg', mastering: 'T. Braun', artwork: 'R. Grün' }, tracks: [ { id: 'tc1', title: 'Harbour Light', duration: '9:14', bpm: null, key: 'Open' }, { id: 'tc2', title: 'Tidal', duration: '8:02', bpm: null, key: 'Open' }, { id: 'tc3', title: 'Meridian', duration: '11:20', bpm: null, key: 'Open' }, { id: 'tc4', title: 'Breakwater', duration: '7:55', bpm: null, key: 'Open' }, { id: 'tc5', title: 'Estuary', duration: '12:49', bpm: null, key: 'Open' } ], description: 'A continuous tide of post-rock that pulls and recedes. Five movements, one landscape.', streamCount: 104000, vinylSold: 190 },

  { id: 'burning-season', title: 'Burning Season', artist: 'Red Desert Road', artistId: 'aura-system', label: 'Obsidian Records', labelId: 'obsidian-records', cover: '/album_r4.svg', year: 2024, catalogNumber: 'OBS-082', genre: 'Garage Rock', formats: ['Digital', 'Vinyl 7"'], vinylPrice: 12.00, downloadPrice: 0.90, duration: '18:40', tags: ['garage rock', 'punk', 'raw'], credits: { producer: 'Red Desert Road', recordedAt: 'Garage, Austin TX', mastering: 'Live to tape', artwork: 'RDR' }, tracks: [ { id: 'rdr1', title: 'Burning Season', duration: '3:12', bpm: 145, key: 'E' }, { id: 'rdr2', title: 'Desert Haze', duration: '2:58', bpm: 150, key: 'A' }, { id: 'rdr3', title: 'Raw', duration: '2:44', bpm: 140, key: 'D' }, { id: 'rdr4', title: 'Fuel', duration: '3:22', bpm: 148, key: 'G' }, { id: 'rdr5', title: 'Ember', duration: '3:08', bpm: 135, key: 'E' }, { id: 'rdr6', title: 'After the Fire', duration: '3:16', bpm: 125, key: 'A min' } ], description: 'Six tracks in under twenty minutes. The sound of something set alight.', streamCount: 61000, vinylSold: 320 },

  { id: 'soft-architecture', title: 'Soft Architecture', artist: 'Vessel Club', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_r5.svg', year: 2025, catalogNumber: 'VC-003', genre: 'Dream Pop', formats: ['Digital', 'Vinyl LP'], vinylPrice: 22.00, downloadPrice: 1.10, duration: '46:00', tags: ['dream pop', 'indie', 'ethereal'], credits: { producer: 'Vessel Club', recordedAt: 'Studio Soleil, Lyon', mastering: 'H. Perrin', artwork: 'M. Laurent' }, tracks: [ { id: 'vc1', title: 'Soft Architecture', duration: '5:10', bpm: 90, key: 'G maj' }, { id: 'vc2', title: 'Velour', duration: '4:48', bpm: 85, key: 'C maj' }, { id: 'vc3', title: 'Outline', duration: '5:20', bpm: 88, key: 'F maj' }, { id: 'vc4', title: 'Blueprint', duration: '4:55', bpm: 92, key: 'D maj' }, { id: 'vc5', title: 'Interior Light', duration: '5:44', bpm: 82, key: 'A maj' }, { id: 'vc6', title: 'Shelter', duration: '5:02', bpm: 86, key: 'E maj' }, { id: 'vc7', title: 'Dissolve', duration: '6:10', bpm: 80, key: 'B maj' }, { id: 'vc8', title: 'Fondation', duration: '4:32', bpm: 88, key: 'G maj' } ], description: 'Dream pop with structural intent. Beautiful songs built like rooms you can live in.', streamCount: 76000, vinylSold: 145 },

  { id: 'patterns', title: 'Patterns', artist: 'Dune Complex', artistId: 'aura-system', label: 'Obsidian Records', labelId: 'obsidian-records', cover: '/album_r6.svg', year: 2023, catalogNumber: 'OBS-071', genre: 'Math Rock', formats: ['Digital', 'Vinyl 12"'], vinylPrice: 19.00, downloadPrice: 1.20, duration: '38:15', tags: ['math rock', 'progressive', 'instrumental'], credits: { producer: 'Dune Complex', recordedAt: 'Space Station Studio, Berlin', mastering: 'Karl Heinz', artwork: 'D. Complex' }, tracks: [ { id: 'dc1', title: '5/4', duration: '5:22', bpm: 160, key: 'C#' }, { id: 'dc2', title: '7/8', duration: '4:44', bpm: 175, key: 'F#' }, { id: 'dc3', title: 'Prime', duration: '6:10', bpm: 155, key: 'A' }, { id: 'dc4', title: 'Loop', duration: '5:02', bpm: 168, key: 'E' }, { id: 'dc5', title: 'Recursion', duration: '7:28', bpm: 152, key: 'B' }, { id: 'dc6', title: 'Resolution', duration: '4:55', bpm: 140, key: 'D' }, { id: 'dc7', title: 'Patterns', duration: '4:34', bpm: 163, key: 'G' } ], description: 'Complex time signatures made to feel inevitable. Cerebral rock with a physical impact.', streamCount: 93000, vinylSold: 178 },

  { id: 'all-at-once', title: 'All at Once', artist: 'The Mornings', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_r7.svg', year: 2024, catalogNumber: 'QSJ-208', genre: 'Indie Pop', formats: ['Digital', 'Vinyl LP', 'CD'], vinylPrice: 20.00, downloadPrice: 1.00, duration: '41:30', tags: ['indie pop', 'british', 'catchy'], credits: { producer: 'The Mornings', recordedAt: 'Rockfield Studio, Wales', mastering: 'S. Ellis', artwork: 'J. Brown' }, tracks: [ { id: 'tm1', title: 'All at Once', duration: '3:40', bpm: 128, key: 'G maj' }, { id: 'tm2', title: 'Golden Hour', duration: '3:55', bpm: 124, key: 'C maj' }, { id: 'tm3', title: 'Overflow', duration: '4:12', bpm: 120, key: 'D maj' }, { id: 'tm4', title: 'Saturday', duration: '3:28', bpm: 132, key: 'A maj' }, { id: 'tm5', title: 'Bright', duration: '3:18', bpm: 126, key: 'E maj' }, { id: 'tm6', title: 'Ordinary Love', duration: '4:05', bpm: 118, key: 'F maj' }, { id: 'tm7', title: 'Telescope', duration: '4:40', bpm: 115, key: 'B maj' }, { id: 'tm8', title: 'Last Train', duration: '3:52', bpm: 130, key: 'G maj' }, { id: 'tm9', title: 'All at Once (Reprise)', duration: '3:20', bpm: 128, key: 'G maj' }, { id: 'tm10', title: 'Stay', duration: '5:10', bpm: 100, key: 'C maj' } ], description: 'A debut full of hooks and honesty. Brit-pop heart with a modern production.', streamCount: 218000, vinylSold: 260 },

  { id: 'northern-lights', title: 'Northern Lights', artist: 'Cold Pacific', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_r8.svg', year: 2025, catalogNumber: 'CP-001', genre: 'Shoegaze / Ambient', formats: ['Digital', 'Vinyl LP'], vinylPrice: 22.00, downloadPrice: 1.00, duration: '54:15', tags: ['shoegaze', 'ambient', 'cold', 'nordic'], credits: { producer: 'Cold Pacific', recordedAt: 'Reykjavik, Iceland', mastering: 'S. Ólafsson', artwork: 'Cold Pacific' }, tracks: [ { id: 'cp1', title: 'Aurora', duration: '8:12', bpm: null, key: 'Open' }, { id: 'cp2', title: 'Glacier', duration: '9:44', bpm: null, key: 'Open' }, { id: 'cp3', title: 'Drift Ice', duration: '10:02', bpm: null, key: 'Open' }, { id: 'cp4', title: 'Northern Lights', duration: '12:18', bpm: null, key: 'Open' }, { id: 'cp5', title: 'Thaw', duration: '13:59', bpm: null, key: 'Open' } ], description: 'Recorded in the dead of winter in Iceland. Glacial, luminous, and disarmingly still.', streamCount: 64000, vinylSold: 130 },

  { id: 'glass-animals-ep', title: 'Glass Animals', artist: 'Wren', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_r9.svg', year: 2024, catalogNumber: 'WR-001', genre: 'Indie Folk', formats: ['Digital', 'Vinyl 10"'], vinylPrice: 15.00, downloadPrice: 0.90, duration: '22:10', tags: ['indie folk', 'acoustic', 'intimate'], credits: { producer: 'Wren', recordedAt: 'Bedroom studio, Bristol', mastering: 'L. Hart', artwork: 'Wren' }, tracks: [ { id: 'wr1', title: 'Glass Animals', duration: '4:22', bpm: 72, key: 'C maj' }, { id: 'wr2', title: 'Porcelain', duration: '3:55', bpm: 68, key: 'G maj' }, { id: 'wr3', title: 'Brittle', duration: '4:10', bpm: 70, key: 'D maj' }, { id: 'wr4', title: 'Still', duration: '4:38', bpm: 65, key: 'A maj' }, { id: 'wr5', title: 'Hollow', duration: '5:05', bpm: 74, key: 'E maj' } ], description: 'Fragile, intimate songwriting. Five songs about things that hold their shape until they don\'t.', streamCount: 54000, vinylSold: 98 },

  { id: 'concrete-garden', title: 'Concrete Garden', artist: 'The Static Rivers', artistId: 'klyde', label: 'Rare Sounds', labelId: 'rare-sounds', cover: '/album_r10.svg', year: 2023, catalogNumber: 'RS-018', genre: 'Indie Rock', formats: ['Digital', 'Vinyl LP'], vinylPrice: 19.00, downloadPrice: 1.00, duration: '43:40', tags: ['indie rock', 'urban', 'melodic'], credits: { producer: 'The Static Rivers', recordedAt: 'Studio Garage, Paris', mastering: 'H. Perrin', artwork: 'TSR' }, tracks: [ { id: 'sr1', title: 'Concrete Garden', duration: '4:02', bpm: 115, key: 'D min' }, { id: 'sr2', title: 'Traffic', duration: '3:48', bpm: 118, key: 'G min' }, { id: 'sr3', title: 'City Blue', duration: '4:20', bpm: 112, key: 'A min' }, { id: 'sr4', title: 'Roots', duration: '5:12', bpm: 108, key: 'E min' }, { id: 'sr5', title: 'Pavement', duration: '4:44', bpm: 120, key: 'C min' }, { id: 'sr6', title: 'Overgrown', duration: '3:58', bpm: 114, key: 'F min' }, { id: 'sr7', title: 'Rebar', duration: '4:30', bpm: 116, key: 'B min' }, { id: 'sr8', title: 'Garden State', duration: '5:02', bpm: 105, key: 'D min' }, { id: 'sr9', title: 'Renewal', duration: '4:18', bpm: 110, key: 'G min' }, { id: 'sr10', title: 'Seed', duration: '3:46', bpm: 108, key: 'A min' } ], description: 'Urban indie rock rooted in texture and contrast. Ten songs about the city as nature.', streamCount: 97000, vinylSold: 165 },

  // ── JAZZ (8) ──
  { id: 'miles-ahead-ep', title: 'Miles Ahead', artist: 'The Quartet', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_j1.svg', year: 2025, catalogNumber: 'QSJ-212', genre: 'Modern Jazz', formats: ['Digital', 'Vinyl LP'], vinylPrice: 25.00, downloadPrice: 1.20, duration: '48:20', tags: ['jazz', 'modern', 'bop'], credits: { producer: 'The Quartet', recordedAt: 'Van Gelder Studio, NJ', mastering: 'T. Henderson', artwork: 'J. Williams' }, tracks: [ { id: 'qt1', title: 'Miles Ahead', duration: '8:10', bpm: null, key: 'F maj' }, { id: 'qt2', title: 'Vanguard', duration: '9:22', bpm: null, key: 'Bb min' }, { id: 'qt3', title: 'Forward Motion', duration: '10:44', bpm: null, key: 'G min' }, { id: 'qt4', title: 'The Change', duration: '7:58', bpm: null, key: 'Eb maj' }, { id: 'qt5', title: 'Return', duration: '12:06', bpm: null, key: 'Db maj' } ], description: 'Live in studio. Five extended improvisations pointing toward something new.', streamCount: 124000, vinylSold: 215 },

  { id: 'evening-set', title: 'Evening Set', artist: 'Lola Rêve', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_j2.svg', year: 2025, catalogNumber: 'QSJ-213', genre: 'Vocal Jazz', formats: ['Digital', 'Vinyl LP', 'CD'], vinylPrice: 24.00, downloadPrice: 1.20, duration: '44:55', tags: ['vocal jazz', 'standards', 'intimate'], credits: { producer: 'Marcus Cole', recordedAt: 'Village Vanguard, New York', mastering: 'T. Henderson', artwork: 'S. Ford' }, tracks: [ { id: 'lr1', title: 'Come Twilight', duration: '5:10', bpm: null, key: 'F maj' }, { id: 'lr2', title: 'Blue Hotel', duration: '4:58', bpm: null, key: 'Bb min' }, { id: 'lr3', title: 'Smoke and Mirrors', duration: '6:22', bpm: null, key: 'G min' }, { id: 'lr4', title: 'Last Dance', duration: '5:44', bpm: null, key: 'Db maj' }, { id: 'lr5', title: 'My Foolish Heart', duration: '4:30', bpm: null, key: 'Eb maj' }, { id: 'lr6', title: 'Evening Set', duration: '7:12', bpm: null, key: 'F min' }, { id: 'lr7', title: 'Night Bird', duration: '5:02', bpm: null, key: 'C min' }, { id: 'lr8', title: 'Till Next Time', duration: '5:57', bpm: null, key: 'A maj' } ], description: 'A live vocal jazz set of heartbreaking elegance. Lola Rêve at the piano bar after hours.', streamCount: 164000, vinylSold: 248 },

  { id: 'third-floor', title: 'Third Floor', artist: 'Dominic Shaw', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_j3.svg', year: 2023, catalogNumber: 'QSJ-204', genre: 'Piano Jazz', formats: ['Digital', 'Vinyl LP'], vinylPrice: 22.00, downloadPrice: 1.10, duration: '51:40', tags: ['piano', 'jazz', 'solo', 'classical'], credits: { producer: 'Dominic Shaw', recordedAt: 'Salle Pleyel, Paris', mastering: 'C. Morel', artwork: 'N. Bernard' }, tracks: [ { id: 'ds1', title: 'Third Floor', duration: '7:22', bpm: null, key: 'D maj' }, { id: 'ds2', title: 'Ballad for E.', duration: '9:10', bpm: null, key: 'F# min' }, { id: 'ds3', title: 'Modal Study No.3', duration: '8:44', bpm: null, key: 'Open' }, { id: 'ds4', title: 'Elevation', duration: '6:58', bpm: null, key: 'C maj' }, { id: 'ds5', title: 'Stairwell', duration: '7:12', bpm: null, key: 'E min' }, { id: 'ds6', title: 'The Landing', duration: '12:14', bpm: null, key: 'Bb maj' } ], description: 'Solo piano in a grand hall. Shaw strips jazz down to architecture and feeling.', streamCount: 86000, vinylSold: 172 },

  { id: 'open-standard', title: 'Open Standard', artist: 'Seun Collective', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_j4.svg', year: 2024, catalogNumber: 'QSJ-210', genre: 'Afro-Jazz', formats: ['Digital', 'Vinyl LP'], vinylPrice: 24.00, downloadPrice: 1.10, duration: '54:00', tags: ['afro-jazz', 'percussion', 'world', 'polyrhythm'], credits: { producer: 'Seun Collective', recordedAt: 'Studio Afrotone, Lagos & New York', mastering: 'O. Johnson', artwork: 'Seun Collective' }, tracks: [ { id: 'sc1', title: 'Open Standard', duration: '9:44', bpm: null, key: 'Open' }, { id: 'sc2', title: 'Lagos to Harlem', duration: '8:12', bpm: null, key: 'Open' }, { id: 'sc3', title: 'Percussion Map', duration: '10:02', bpm: null, key: 'Open' }, { id: 'sc4', title: 'Spiral', duration: '7:40', bpm: null, key: 'Open' }, { id: 'sc5', title: 'Root Frequency', duration: '10:22', bpm: null, key: 'Open' }, { id: 'sc6', title: 'Return Ceremony', duration: '8:00', bpm: null, key: 'Open' } ], description: 'Six extended explorations at the intersection of West African rhythm and New York jazz.', streamCount: 102000, vinylSold: 184 },

  { id: 'resonance-tr', title: 'Resonance', artist: 'Emi Nakashima Trio', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_j5.svg', year: 2023, catalogNumber: 'QSJ-202', genre: 'Contemporary Jazz', formats: ['Digital', 'CD'], vinylPrice: null, downloadPrice: 1.00, duration: '46:30', tags: ['jazz', 'contemporary', 'trio', 'Japanese'], credits: { producer: 'Emi Nakashima', recordedAt: 'Studio Oto, Tokyo', mastering: 'Y. Sato', artwork: 'E. Nakashima' }, tracks: [ { id: 'en1', title: 'Resonance', duration: '7:40', bpm: null, key: 'D maj' }, { id: 'en2', title: 'Silence Before', duration: '6:18', bpm: null, key: 'Open' }, { id: 'en3', title: 'Interval', duration: '5:55', bpm: null, key: 'F maj' }, { id: 'en4', title: 'Water Study', duration: '8:22', bpm: null, key: 'Open' }, { id: 'en5', title: 'Ma', duration: '9:00', bpm: null, key: 'Open' }, { id: 'en6', title: 'Return', duration: '9:15', bpm: null, key: 'D maj' } ], description: 'A minimalist trio record shaped by Japanese aesthetics and American jazz vocabulary.', streamCount: 77000, vinylSold: 0 },

  { id: 'free-motion', title: 'Free Motion', artist: 'Ade Mensah', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_j7.svg', year: 2025, catalogNumber: 'QSJ-215', genre: 'Free Jazz', formats: ['Digital', 'Vinyl 12"'], vinylPrice: 18.00, downloadPrice: 1.00, duration: '39:50', tags: ['free jazz', 'experimental', 'avant-garde'], credits: { producer: 'Ade Mensah', recordedAt: 'I.C.P., Amsterdam', mastering: 'K. Visser', artwork: 'A. Mensah' }, tracks: [ { id: 'am1', title: 'Free Motion I', duration: '14:22', bpm: null, key: 'Open' }, { id: 'am2', title: 'Free Motion II', duration: '12:44', bpm: null, key: 'Open' }, { id: 'am3', title: 'Free Motion III', duration: '12:44', bpm: null, key: 'Open' } ], description: 'Three long takes, zero preparation, total commitment. Free jazz as it should be.', streamCount: 42000, vinylSold: 120 },

  { id: 'uptown-moves', title: 'Uptown Moves', artist: 'Westside Brass', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_j8.svg', year: 2024, catalogNumber: 'QSJ-209', genre: 'Jazz / Soul', formats: ['Digital', 'Vinyl LP', 'CD'], vinylPrice: 23.00, downloadPrice: 1.20, duration: '52:15', tags: ['jazz', 'soul', 'brass', 'groovy'], credits: { producer: 'Westside Brass', recordedAt: 'Rudy Van Gelder Studio, NJ', mastering: 'T. Henderson', artwork: 'B. King Jr.' }, tracks: [ { id: 'wb1', title: 'Uptown', duration: '5:40', bpm: 110, key: 'Bb maj' }, { id: 'wb2', title: 'Second Line', duration: '6:22', bpm: 118, key: 'F maj' }, { id: 'wb3', title: 'Brass Section', duration: '4:58', bpm: 105, key: 'Eb maj' }, { id: 'wb4', title: 'Soul Kitchen', duration: '7:12', bpm: 98, key: 'G min' }, { id: 'wb5', title: 'The Avenue', duration: '5:30', bpm: 112, key: 'C maj' }, { id: 'wb6', title: 'Horn Section', duration: '6:44', bpm: 120, key: 'Ab maj' }, { id: 'wb7', title: 'Good Trouble', duration: '5:02', bpm: 108, key: 'F min' }, { id: 'wb8', title: 'Last Brass', duration: '6:20', bpm: 100, key: 'Bb min' }, { id: 'wb9', title: 'Moves', duration: '4:27', bpm: 115, key: 'D maj' } ], description: 'A nine-piece brass ensemble playing jazz-soul with unrelenting joy and precision.', streamCount: 137000, vinylSold: 198 },

  // ── TECHNO / ELECTRONIC (10) ──
  { id: 'axis-ep', title: 'Axis', artist: 'GRVT', artistId: 'aura-system', label: 'Obsidian Records', labelId: 'obsidian-records', cover: '/album_t1.svg', year: 2025, catalogNumber: 'OBS-088', genre: 'Hard Techno', formats: ['Vinyl 12"'], vinylPrice: 16.00, downloadPrice: 1.10, duration: '22:10', tags: ['hard techno', 'industrial', 'raw'], credits: { producer: 'GRVT', recordedAt: 'Studio OBS, Berlin', mastering: 'Karl Heinz', artwork: 'GRVT' }, tracks: [ { id: 'grvt1', title: 'Axis A1', duration: '7:22', bpm: 145, key: 'F min' }, { id: 'grvt2', title: 'Axis A2', duration: '7:40', bpm: 148, key: 'G min' }, { id: 'grvt3', title: 'Axis B1', duration: '7:08', bpm: 143, key: 'D min' } ], description: 'Three tracks of uncompromising hard techno from Berlin. Designed for Room 1.', streamCount: 178000, vinylSold: 480 },

  { id: 'tessellation', title: 'Tessellation', artist: 'Module 9', artistId: 'aura-system', label: 'Obsidian Records', labelId: 'obsidian-records', cover: '/album_t2.svg', year: 2024, catalogNumber: 'OBS-083', genre: 'Modular Techno', formats: ['Digital', 'Vinyl 12"'], vinylPrice: 17.00, downloadPrice: 1.10, duration: '28:40', tags: ['modular', 'techno', 'experimental', 'hardware'], credits: { producer: 'Module 9', recordedAt: 'Studio OBS, Berlin', mastering: 'Karl Heinz', artwork: 'Module 9' }, tracks: [ { id: 'mo1', title: 'Patch 1', duration: '9:44', bpm: 136, key: 'A min' }, { id: 'mo2', title: 'Patch 2', duration: '8:58', bpm: 138, key: 'D min' }, { id: 'mo3', title: 'Patch 3', duration: '9:58', bpm: 134, key: 'E min' } ], description: 'Live modular system — one take each side. Pure signal flow.', streamCount: 92000, vinylSold: 340 },

  { id: 'pressure-zone', title: 'Pressure Zone', artist: 'Lex0', artistId: 'aura-system', label: 'Obsidian Records', labelId: 'obsidian-records', cover: '/album_t3.svg', year: 2024, catalogNumber: 'OBS-085', genre: 'Industrial Techno', formats: ['Vinyl 12"'], vinylPrice: 15.50, downloadPrice: 1.10, duration: '26:20', tags: ['industrial', 'techno', 'percussion', 'noise'], credits: { producer: 'Lex0', recordedAt: 'Studio OBS, Berlin', mastering: 'Karl Heinz', artwork: 'Lex0' }, tracks: [ { id: 'lx1', title: 'Pressure Zone A1', duration: '8:44', bpm: 140, key: 'B min' }, { id: 'lx2', title: 'Pressure Zone A2', duration: '8:10', bpm: 142, key: 'F# min' }, { id: 'lx3', title: 'Pressure Zone B', duration: '9:26', bpm: 138, key: 'C# min' } ], description: 'Industrial percussion and noise walls assembled into peak-hour weapons.', streamCount: 138000, vinylSold: 420 },

  { id: 'biome', title: 'Biome', artist: 'Atoll', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_t4.svg', year: 2025, catalogNumber: 'AT-003', genre: 'Electronica', formats: ['Digital', 'Vinyl LP'], vinylPrice: 22.00, downloadPrice: 1.00, duration: '56:30', tags: ['electronica', 'organic', 'textural', 'green'], credits: { producer: 'Atoll', recordedAt: 'Studio Fantôme, Paris', mastering: 'S. Arnaud', artwork: 'Atoll' }, tracks: [ { id: 'at1', title: 'Canopy', duration: '8:22', bpm: 104, key: 'G min' }, { id: 'at2', title: 'Root System', duration: '9:44', bpm: 98, key: 'D min' }, { id: 'at3', title: 'Mycelium', duration: '10:12', bpm: 88, key: 'A min' }, { id: 'at4', title: 'Photosynthesis', duration: '7:58', bpm: 110, key: 'E min' }, { id: 'at5', title: 'Biome', duration: '12:02', bpm: 92, key: 'C min' }, { id: 'at6', title: 'Spore', duration: '8:12', bpm: 100, key: 'F min' } ], description: 'Electronic music as living system. Ecological in form and substance.', streamCount: 84000, vinylSold: 162 },

  { id: 'hyperplane', title: 'Hyperplane', artist: 'Echo/Vector', artistId: 'aura-system', label: 'Obsidian Records', labelId: 'obsidian-records', cover: '/album_t5.svg', year: 2025, catalogNumber: 'OBS-089', genre: 'Melodic Techno', formats: ['Digital', 'Vinyl 12"'], vinylPrice: 18.00, downloadPrice: 1.20, duration: '32:10', tags: ['melodic techno', 'emotional', 'danceable'], credits: { producer: 'Echo/Vector', recordedAt: 'Studio OBS, Berlin', mastering: 'Karl Heinz', artwork: 'Echo/Vector' }, tracks: [ { id: 'ev1', title: 'Vector A', duration: '8:10', bpm: 132, key: 'F# min' }, { id: 'ev2', title: 'Vector B', duration: '8:44', bpm: 134, key: 'B min' }, { id: 'ev3', title: 'Vector C', duration: '7:58', bpm: 130, key: 'E min' }, { id: 'ev4', title: 'Hyperplane', duration: '7:18', bpm: 135, key: 'C# min' } ], description: 'Four tracks of melodic techno with emotional depth. Peak time meets peak feeling.', streamCount: 196000, vinylSold: 510 },

  { id: 'cascade', title: 'Cascade', artist: 'Seren', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_t6.svg', year: 2024, catalogNumber: 'SR-002', genre: 'Progressive Electronic', formats: ['Digital', 'Vinyl LP'], vinylPrice: 21.00, downloadPrice: 1.00, duration: '58:40', tags: ['progressive', 'electronic', 'deep', 'journey'], credits: { producer: 'Seren', recordedAt: 'Studio Fantôme, Paris', mastering: 'S. Arnaud', artwork: 'Seren' }, tracks: [ { id: 'se1', title: 'Source', duration: '7:12', bpm: 120, key: 'A min' }, { id: 'se2', title: 'Tributary', duration: '8:44', bpm: 124, key: 'D min' }, { id: 'se3', title: 'Cascade', duration: '10:22', bpm: 126, key: 'G min' }, { id: 'se4', title: 'Deep Current', duration: '9:58', bpm: 122, key: 'E min' }, { id: 'se5', title: 'Estuary', duration: '11:02', bpm: 118, key: 'C min' }, { id: 'se6', title: 'Delta', duration: '11:22', bpm: 116, key: 'F min' } ], description: 'A six-chapter progressive electronic journey from surface to depth.', streamCount: 72000, vinylSold: 139 },

  { id: 'synthetic-garden', title: 'Synthetic Garden', artist: 'Flora OS', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_t8.svg', year: 2023, catalogNumber: 'FO-001', genre: 'Ambient Techno', formats: ['Digital', 'Vinyl LP'], vinylPrice: 21.00, downloadPrice: 1.00, duration: '52:20', tags: ['ambient techno', 'soft', 'synthetic', 'organic'], credits: { producer: 'Flora OS', recordedAt: 'Home studio, Amsterdam', mastering: 'K. Visser', artwork: 'Flora OS' }, tracks: [ { id: 'fo1', title: 'Greenhouse Protocol', duration: '8:12', bpm: 112, key: 'C maj' }, { id: 'fo2', title: 'Petal Sequence', duration: '9:44', bpm: 108, key: 'F maj' }, { id: 'fo3', title: 'Photon Garden', duration: '10:02', bpm: 116, key: 'G maj' }, { id: 'fo4', title: 'Synthetic Bloom', duration: '7:44', bpm: 110, key: 'D maj' }, { id: 'fo5', title: 'Compost System', duration: '8:58', bpm: 104, key: 'A maj' }, { id: 'fo6', title: 'Spring Protocol', duration: '7:40', bpm: 112, key: 'E maj' } ], description: 'Ambient techno for the machine that learned to garden. Green and precise.', streamCount: 68000, vinylSold: 128 },

  { id: 'system-override', title: 'System Override', artist: 'KORE', artistId: 'aura-system', label: 'Obsidian Records', labelId: 'obsidian-records', cover: '/album_t10.svg', year: 2025, catalogNumber: 'OBS-090', genre: 'Industrial Techno', formats: ['Vinyl 12"'], vinylPrice: 16.50, downloadPrice: 1.10, duration: '24:44', tags: ['industrial', 'heavy', 'rave', 'techno'], credits: { producer: 'KORE', recordedAt: 'Studio OBS, Berlin', mastering: 'Karl Heinz', artwork: 'KORE' }, tracks: [ { id: 'kr1', title: 'Override A1', duration: '8:22', bpm: 148, key: 'C min' }, { id: 'kr2', title: 'Override A2', duration: '7:58', bpm: 150, key: 'G min' }, { id: 'kr3', title: 'Override B', duration: '8:24', bpm: 145, key: 'D min' } ], description: 'Maximum voltage. KORE delivers three industrial floor destroyers.', streamCount: 152000, vinylSold: 460 },

  // ── LO-FI / INSTRUMENTAL (8) ──
  { id: 'coffee-shop-rain', title: 'Coffee Shop Rain', artist: 'Melo', artistId: 'klyde', label: 'Rare Sounds', labelId: 'rare-sounds', cover: '/album_l1.svg', year: 2024, catalogNumber: 'RS-020', genre: 'Lo-Fi', formats: ['Digital'], vinylPrice: null, downloadPrice: 0.80, duration: '34:20', tags: ['lo-fi', 'chill', 'study', 'cozy'], credits: { producer: 'Melo', recordedAt: 'Bedroom studio, Lyon', mastering: 'H. Perrin', artwork: 'Melo' }, tracks: [ { id: 'ml1', title: 'Morning Pour', duration: '3:02', bpm: 75, key: 'F maj' }, { id: 'ml2', title: 'Window Seat', duration: '2:48', bpm: 70, key: 'C maj' }, { id: 'ml3', title: 'Coffee Shop Rain', duration: '3:22', bpm: 72, key: 'G maj' }, { id: 'ml4', title: 'Steam', duration: '2:55', bpm: 68, key: 'D maj' }, { id: 'ml5', title: 'Afternoon Slump', duration: '3:10', bpm: 74, key: 'A maj' }, { id: 'ml6', title: 'Second Cup', duration: '2:40', bpm: 72, key: 'E maj' }, { id: 'ml7', title: 'Last Sip', duration: '3:18', bpm: 70, key: 'B maj' }, { id: 'ml8', title: 'Closing Time', duration: '3:44', bpm: 66, key: 'F maj' }, { id: 'ml9', title: 'After Hours', duration: '3:02', bpm: 68, key: 'C maj' }, { id: 'ml10', title: 'Goodnight', duration: '2:58', bpm: 64, key: 'G maj' } ], description: 'Ten lo-fi sketches for the coffee shop, the study session, and the quiet afternoon.', streamCount: 312000, vinylSold: 0 },

  { id: 'notebook-sessions', title: 'Notebook Sessions', artist: 'Yui Tanaka', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_l3.svg', year: 2025, catalogNumber: 'YT-001', genre: 'Lo-Fi', formats: ['Digital'], vinylPrice: null, downloadPrice: 0.80, duration: '29:40', tags: ['lo-fi', 'Japan', 'soft', 'pink'], credits: { producer: 'Yui Tanaka', recordedAt: 'Bedroom studio, Osaka', mastering: 'Y. Sato', artwork: 'Yui Tanaka' }, tracks: [ { id: 'yt1', title: 'March Light', duration: '3:12', bpm: 72, key: 'C maj' }, { id: 'yt2', title: 'Pink Eraser', duration: '2:58', bpm: 68, key: 'F maj' }, { id: 'yt3', title: 'Pencil Marks', duration: '3:22', bpm: 74, key: 'G maj' }, { id: 'yt4', title: 'Soft Study', duration: '2:44', bpm: 70, key: 'D maj' }, { id: 'yt5', title: 'Sakura Hour', duration: '3:08', bpm: 66, key: 'A maj' }, { id: 'yt6', title: 'Notebook', duration: '3:40', bpm: 72, key: 'E maj' }, { id: 'yt7', title: 'The End of Term', duration: '3:18', bpm: 68, key: 'B maj' }, { id: 'yt8', title: 'Goodnight, Osaka', duration: '3:18', bpm: 64, key: 'F maj' } ], description: 'Japanese lo-fi from a quiet bedroom in Osaka. Soft and studious.', streamCount: 284000, vinylSold: 0 },

  { id: 'city-hum', title: 'City Hum', artist: 'Dusk', artistId: 'klyde', label: 'Rare Sounds', labelId: 'rare-sounds', cover: '/album_l5.svg', year: 2024, catalogNumber: 'RS-019', genre: 'Lo-Fi Jazz', formats: ['Digital'], vinylPrice: null, downloadPrice: 0.90, duration: '38:20', tags: ['lo-fi jazz', 'urban', 'nocturnal'], credits: { producer: 'Dusk', recordedAt: 'Studio Maison, Lyon', mastering: 'H. Perrin', artwork: 'Dusk' }, tracks: [ { id: 'du1', title: 'Metro Blue', duration: '4:02', bpm: 82, key: 'D min' }, { id: 'du2', title: 'Street Lamp', duration: '3:48', bpm: 78, key: 'G min' }, { id: 'du3', title: 'City Hum', duration: '4:22', bpm: 84, key: 'A min' }, { id: 'du4', title: 'Corner Store', duration: '3:55', bpm: 80, key: 'E min' }, { id: 'du5', title: 'Late Night Bus', duration: '4:10', bpm: 76, key: 'C min' }, { id: 'du6', title: 'Neon', duration: '3:40', bpm: 82, key: 'F min' }, { id: 'du7', title: 'After 2am', duration: '4:58', bpm: 74, key: 'B min' }, { id: 'du8', title: 'Quiet Block', duration: '3:44', bpm: 78, key: 'D min' }, { id: 'du9', title: 'Sunrise Tram', duration: '5:41', bpm: 76, key: 'G min' } ], description: 'Jazz-inflected lo-fi documenting the city from dusk to dawn.', streamCount: 198000, vinylSold: 0 },

  { id: 'slow-hours', title: 'Slow Hours', artist: 'Oriel', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_l6.svg', year: 2023, catalogNumber: 'OR-001', genre: 'Ambient Lo-Fi', formats: ['Digital', 'Vinyl LP'], vinylPrice: 18.00, downloadPrice: 0.90, duration: '44:20', tags: ['ambient', 'lo-fi', 'soft', 'slow'], credits: { producer: 'Oriel', recordedAt: 'Garden studio, Brittany', mastering: 'S. Arnaud', artwork: 'Oriel' }, tracks: [ { id: 'or1', title: 'Slow Start', duration: '5:12', bpm: 60, key: 'C maj' }, { id: 'or2', title: 'Green Tape', duration: '4:44', bpm: 58, key: 'G maj' }, { id: 'or3', title: 'Hour One', duration: '6:02', bpm: 62, key: 'D maj' }, { id: 'or4', title: 'Sage', duration: '5:40', bpm: 56, key: 'F maj' }, { id: 'or5', title: 'Moss', duration: '5:18', bpm: 60, key: 'A maj' }, { id: 'or6', title: 'Still Water', duration: '6:24', bpm: 54, key: 'E maj' }, { id: 'or7', title: 'Slow Hours', duration: '7:00', bpm: 58, key: 'C maj' }, { id: 'or8', title: 'Dark', duration: '4:00', bpm: 52, key: 'A min' } ], description: 'Ambient lo-fi recorded in a garden. Everything at half speed, at its best.', streamCount: 146000, vinylSold: 108 },

  { id: 'rain-paper', title: 'Rain / Paper', artist: 'Miro Kell', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_l8.svg', year: 2025, catalogNumber: 'MK-001', genre: 'Instrumental', formats: ['Digital', 'Vinyl 10"'], vinylPrice: 16.00, downloadPrice: 0.90, duration: '31:40', tags: ['instrumental', 'piano', 'minimal', 'quiet'], credits: { producer: 'Miro Kell', recordedAt: 'Home studio, Brussels', mastering: 'C. Morel', artwork: 'Miro Kell' }, tracks: [ { id: 'mk1', title: 'Rain', duration: '5:02', bpm: null, key: 'C maj' }, { id: 'mk2', title: 'Paper', duration: '4:44', bpm: null, key: 'G maj' }, { id: 'mk3', title: 'Ink', duration: '5:22', bpm: null, key: 'D maj' }, { id: 'mk4', title: 'Fold', duration: '4:12', bpm: null, key: 'A maj' }, { id: 'mk5', title: 'Rain / Paper', duration: '6:10', bpm: null, key: 'F maj' }, { id: 'mk6', title: 'Dry', duration: '6:10', bpm: null, key: 'C maj' } ], description: 'Solo piano in minimalist repose. Two elements — weather and material — eleven variations.', streamCount: 88000, vinylSold: 94 },

  { id: 'midwinter-tape', title: 'Midwinter Tape', artist: 'Foggy Mtn', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_l2.svg', year: 2024, catalogNumber: 'FM-002', genre: 'Lo-Fi Folk', formats: ['Digital', 'Cassette'], vinylPrice: null, downloadPrice: 0.80, duration: '27:30', tags: ['lo-fi folk', 'acoustic', 'cassette', 'winter'], credits: { producer: 'Foggy Mtn', recordedAt: 'Cabin studio, Vermont', mastering: 'Cassette recorded', artwork: 'Foggy Mtn' }, tracks: [ { id: 'fm1', title: 'January', duration: '3:12', bpm: 68, key: 'G maj' }, { id: 'fm2', title: 'Snowfall Tape', duration: '2:58', bpm: 64, key: 'C maj' }, { id: 'fm3', title: 'Midwinter', duration: '3:44', bpm: 70, key: 'D maj' }, { id: 'fm4', title: 'Woodsmoke', duration: '3:02', bpm: 66, key: 'A maj' }, { id: 'fm5', title: 'Thaw', duration: '2:55', bpm: 72, key: 'E maj' }, { id: 'fm6', title: 'February', duration: '3:20', bpm: 68, key: 'B maj' }, { id: 'fm7', title: 'Melt', duration: '4:22', bpm: 62, key: 'G maj' }, { id: 'fm8', title: 'Spring Fog', duration: '3:57', bpm: 70, key: 'C maj' } ], description: 'A lo-fi folk tape recorded in a Vermont cabin. Eight songs about waiting for spring.', streamCount: 112000, vinylSold: 0 },

  { id: 'afternoon-light', title: 'Afternoon Light', artist: 'The Softs', artistId: 'klyde', label: 'Rare Sounds', labelId: 'rare-sounds', cover: '/album_l4.svg', year: 2024, catalogNumber: 'RS-021', genre: 'Lo-Fi Soul', formats: ['Digital'], vinylPrice: null, downloadPrice: 0.80, duration: '32:40', tags: ['lo-fi soul', 'r&b', 'warm', 'golden'], credits: { producer: 'The Softs', recordedAt: 'Studio Maison, Lyon', mastering: 'H. Perrin', artwork: 'The Softs' }, tracks: [ { id: 'ts1', title: 'Sunday', duration: '3:44', bpm: 76, key: 'F maj' }, { id: 'ts2', title: 'Afternoon Light', duration: '4:02', bpm: 72, key: 'Bb maj' }, { id: 'ts3', title: 'Golden', duration: '3:28', bpm: 78, key: 'C maj' }, { id: 'ts4', title: 'Lazy', duration: '3:55', bpm: 70, key: 'G maj' }, { id: 'ts5', title: 'Low', duration: '4:18', bpm: 74, key: 'D maj' }, { id: 'ts6', title: 'Linen', duration: '3:10', bpm: 76, key: 'A maj' }, { id: 'ts7', title: 'Fade', duration: '3:40', bpm: 68, key: 'Eb maj' }, { id: 'ts8', title: 'Late Afternoon', duration: '3:02', bpm: 72, key: 'F maj' }, { id: 'ts9', title: 'Dusk', duration: '3:01', bpm: 66, key: 'Bb maj' } ], description: 'Lo-fi soul for the afternoon when nothing is required of you.', streamCount: 234000, vinylSold: 0 },

  // ── HIP-HOP / RAP (8) ──
  { id: 'street-gospel', title: 'Street Gospel', artist: 'Prophet', artistId: 'klyde', label: 'Rare Sounds', labelId: 'rare-sounds', cover: '/album_h1.svg', year: 2024, catalogNumber: 'RS-016', genre: 'Conscious Hip-Hop', formats: ['Digital', 'Vinyl LP'], vinylPrice: 20.00, downloadPrice: 1.00, duration: '48:20', tags: ['conscious', 'hip-hop', 'political', 'poetry'], credits: { producer: 'Prophet', recordedAt: 'Studio Maison, Lyon', mastering: 'H. Perrin', artwork: 'Prophet' }, tracks: [ { id: 'pr1', title: 'Sermon', duration: '4:12', bpm: 88, key: 'G min' }, { id: 'pr2', title: 'Street Gospel', duration: '5:02', bpm: 92, key: 'D min' }, { id: 'pr3', title: 'Testimony', duration: '4:44', bpm: 86, key: 'A min' }, { id: 'pr4', title: 'Corner Church', duration: '3:58', bpm: 90, key: 'E min' }, { id: 'pr5', title: 'Interlude (Prayer)', duration: '1:30', bpm: null, key: null }, { id: 'pr6', title: 'Congregation', duration: '5:20', bpm: 94, key: 'C min' }, { id: 'pr7', title: 'Hymn', duration: '4:10', bpm: 84, key: 'F min' }, { id: 'pr8', title: 'The Reading', duration: '4:48', bpm: 88, key: 'B min' }, { id: 'pr9', title: 'Amen', duration: '3:22', bpm: 80, key: 'G min' }, { id: 'pr10', title: 'Benediction', duration: '5:10', bpm: 76, key: 'D min' }, { id: 'pr11', title: 'Exit Music', duration: '6:04', bpm: null, key: null } ], description: 'Conscious rap built like a church service. Prophet delivers testimony from the street.', streamCount: 162000, vinylSold: 148 },

  { id: 'no-signal', title: 'No Signal', artist: 'D.Maze', artistId: 'klyde', label: 'Rare Sounds', labelId: 'rare-sounds', cover: '/album_h2.svg', year: 2025, catalogNumber: 'RS-023', genre: 'Trap', formats: ['Digital'], vinylPrice: null, downloadPrice: 1.00, duration: '32:40', tags: ['trap', 'darker', 'french rap', 'urban'], credits: { producer: 'D.Maze', recordedAt: 'Studio Maison, Lyon', mastering: 'H. Perrin', artwork: 'D.Maze' }, tracks: [ { id: 'dm1', title: 'No Signal', duration: '3:12', bpm: 140, key: 'C min' }, { id: 'dm2', title: 'Zone Noire', duration: '2:58', bpm: 144, key: 'G min' }, { id: 'dm3', title: 'Frequencies', duration: '3:40', bpm: 138, key: 'D min' }, { id: 'dm4', title: 'Dead Zones', duration: '3:22', bpm: 142, key: 'A min' }, { id: 'dm5', title: 'Static (Interlude)', duration: '1:20', bpm: null, key: null }, { id: 'dm6', title: 'Blackout', duration: '3:44', bpm: 145, key: 'E min' }, { id: 'dm7', title: 'Interference', duration: '3:10', bpm: 140, key: 'C min' }, { id: 'dm8', title: 'Cut', duration: '2:44', bpm: 148, key: 'F min' }, { id: 'dm9', title: 'Signal Lost', duration: '4:22', bpm: 136, key: 'B min' }, { id: 'dm10', title: 'Final Transmission', duration: '4:08', bpm: null, key: null } ], description: 'French trap from the periphery. Minimal, atmospheric, and merciless.', streamCount: 274000, vinylSold: 0 },

  { id: 'alchemist-hours', title: 'Alchemist Hours', artist: 'Rue', artistId: 'klyde', label: 'Rare Sounds', labelId: 'rare-sounds', cover: '/album_h3.svg', year: 2024, catalogNumber: 'RS-017', genre: 'Boom-Bap', formats: ['Digital', 'Vinyl LP'], vinylPrice: 19.00, downloadPrice: 1.00, duration: '42:10', tags: ['boom-bap', 'golden age', 'samples', 'underground'], credits: { producer: 'Rue', recordedAt: 'Studio Maison, Lyon', mastering: 'H. Perrin', artwork: 'Rue' }, tracks: [ { id: 'ru1', title: 'Alchemist Hours', duration: '4:02', bpm: 88, key: 'D min' }, { id: 'ru2', title: 'Lead to Gold', duration: '3:48', bpm: 92, key: 'G min' }, { id: 'ru3', title: 'Sample Science', duration: '4:20', bpm: 86, key: 'A min' }, { id: 'ru4', title: 'Diggers', duration: '3:55', bpm: 90, key: 'E min' }, { id: 'ru5', title: 'Breaks & Rhymes', duration: '4:44', bpm: 94, key: 'C min' }, { id: 'ru6', title: 'Crate Dust', duration: '3:28', bpm: 88, key: 'F min' }, { id: 'ru7', title: 'The Process', duration: '5:10', bpm: 84, key: 'B min' }, { id: 'ru8', title: 'Pure', duration: '4:02', bpm: 90, key: 'D min' }, { id: 'ru9', title: 'Outro (Gold)', duration: '4:41', bpm: null, key: null } ], description: 'Boom-bap rooted in the golden age. Sample science, precise bars, no features.', streamCount: 194000, vinylSold: 212 },

  { id: 'glass-house', title: 'Glass House', artist: 'SWAY', artistId: 'klyde', label: 'Rare Sounds', labelId: 'rare-sounds', cover: '/album_h4.svg', year: 2025, catalogNumber: 'RS-024', genre: 'Melodic Rap', formats: ['Digital'], vinylPrice: null, downloadPrice: 1.00, duration: '36:50', tags: ['melodic rap', 'R&B', 'french', 'light'], credits: { producer: 'SWAY', recordedAt: 'Studio Maison, Lyon', mastering: 'H. Perrin', artwork: 'SWAY' }, tracks: [ { id: 'sw1', title: 'Glass', duration: '3:40', bpm: 80, key: 'F maj' }, { id: 'sw2', title: 'House', duration: '4:02', bpm: 76, key: 'Bb maj' }, { id: 'sw3', title: 'Transparent', duration: '3:55', bpm: 82, key: 'C maj' }, { id: 'sw4', title: 'See Through', duration: '3:28', bpm: 78, key: 'G maj' }, { id: 'sw5', title: 'Fragile', duration: '4:12', bpm: 74, key: 'D maj' }, { id: 'sw6', title: 'Crystal', duration: '3:44', bpm: 80, key: 'A maj' }, { id: 'sw7', title: 'Shatter', duration: '4:18', bpm: 84, key: 'Eb maj' }, { id: 'sw8', title: 'Rebuild', duration: '3:40', bpm: 76, key: 'F maj' }, { id: 'sw9', title: 'Glass House (Outro)', duration: '6:11', bpm: null, key: null } ], description: 'Melodic French rap with emotional honesty and structural clarity.', streamCount: 218000, vinylSold: 0 },

  { id: 'heavy-weather', title: 'Heavy Weather', artist: 'Crest', artistId: 'klyde', label: 'Rare Sounds', labelId: 'rare-sounds', cover: '/album_h5.svg', year: 2024, catalogNumber: 'RS-015', genre: 'Atmospheric Hip-Hop', formats: ['Digital', 'Vinyl LP'], vinylPrice: 20.00, downloadPrice: 1.00, duration: '44:10', tags: ['atmospheric', 'hip-hop', 'rainy', 'cinematic'], credits: { producer: 'Crest', recordedAt: 'Studio Maison, Lyon', mastering: 'H. Perrin', artwork: 'Crest' }, tracks: [ { id: 'cr1', title: 'Low Pressure', duration: '4:40', bpm: 82, key: 'G min' }, { id: 'cr2', title: 'Storm Front', duration: '4:12', bpm: 86, key: 'D min' }, { id: 'cr3', title: 'Heavy Weather', duration: '5:02', bpm: 80, key: 'A min' }, { id: 'cr4', title: 'Downpour', duration: '4:44', bpm: 84, key: 'E min' }, { id: 'cr5', title: 'Grey Clouds', duration: '3:58', bpm: 78, key: 'C min' }, { id: 'cr6', title: 'Pressure Drop', duration: '4:20', bpm: 88, key: 'F min' }, { id: 'cr7', title: 'Clearing', duration: '4:02', bpm: 82, key: 'B min' }, { id: 'cr8', title: 'After', duration: '5:10', bpm: 76, key: 'G min' }, { id: 'cr9', title: 'Rainbow', duration: '3:22', bpm: 80, key: 'D min' }, { id: 'cr10', title: 'Sun', duration: '4:40', bpm: null, key: null } ], description: 'Ten scene-setting tracks about waiting, pressure, and the weather that never breaks.', streamCount: 148000, vinylSold: 126 },

  { id: 'basement-science', title: 'Basement Science', artist: 'The Lab', artistId: 'klyde', label: 'Rare Sounds', labelId: 'rare-sounds', cover: '/album_h6.svg', year: 2023, catalogNumber: 'RS-013', genre: 'Underground Hip-Hop', formats: ['Digital', 'Vinyl 12"'], vinylPrice: 17.00, downloadPrice: 0.90, duration: '28:40', tags: ['underground', 'hip-hop', 'experimental', 'collective'], credits: { producer: 'The Lab', recordedAt: 'Basement studio, Lyon', mastering: 'H. Perrin', artwork: 'The Lab' }, tracks: [ { id: 'tl1', title: 'Experiment 1', duration: '4:12', bpm: 90, key: 'C min' }, { id: 'tl2', title: 'Experiment 2', duration: '3:58', bpm: 94, key: 'G min' }, { id: 'tl3', title: 'Control Group', duration: '4:44', bpm: 88, key: 'D min' }, { id: 'tl4', title: 'Variable', duration: '3:40', bpm: 92, key: 'A min' }, { id: 'tl5', title: 'Hypothesis', duration: '4:22', bpm: 86, key: 'E min' }, { id: 'tl6', title: 'Conclusion', duration: '5:22', bpm: 80, key: 'F min' }, { id: 'tl7', title: 'Results', duration: '2:22', bpm: null, key: null } ], description: 'Seven underground hip-hop tracks made in a collective basement. Uncompromising and raw.', streamCount: 86000, vinylSold: 178 },

  // ── AMBIENT / EXPERIMENTAL (6) ──
  { id: 'tides-within', title: 'Tides Within', artist: 'Pale Sequence', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_a1.svg', year: 2025, catalogNumber: 'PS-002', genre: 'Ambient', formats: ['Digital', 'Vinyl LP'], vinylPrice: 21.00, downloadPrice: 1.00, duration: '58:24', tags: ['ambient', 'deep', 'oceanic', 'blue'], credits: { producer: 'Pale Sequence', recordedAt: 'Studio Fantôme, Paris', mastering: 'S. Arnaud', artwork: 'Pale Sequence' }, tracks: [ { id: 'ps1', title: 'Tide 1 — In', duration: '14:22', bpm: null, key: 'Open' }, { id: 'ps2', title: 'Tide 2 — Hold', duration: '16:02', bpm: null, key: 'Open' }, { id: 'ps3', title: 'Tide 3 — Out', duration: '14:40', bpm: null, key: 'Open' }, { id: 'ps4', title: 'Between Tides', duration: '13:20', bpm: null, key: 'Open' } ], description: 'Four movements of oceanic ambient. The most physical music you can hear without touching anything.', streamCount: 56000, vinylSold: 108 },

  { id: 'architect', title: 'Architect', artist: 'Frame', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_a2.svg', year: 2024, catalogNumber: 'FR-001', genre: 'Post-Rock', formats: ['Digital', 'Vinyl LP'], vinylPrice: 23.00, downloadPrice: 1.00, duration: '50:40', tags: ['post-rock', 'cinematic', 'instrumental', 'intense'], credits: { producer: 'Frame', recordedAt: 'Monolith Studio, Brussels', mastering: 'C. Morel', artwork: 'Frame' }, tracks: [ { id: 'fr1', title: 'Foundation', duration: '8:44', bpm: null, key: 'Open' }, { id: 'fr2', title: 'Load-Bearing', duration: '9:12', bpm: null, key: 'Open' }, { id: 'fr3', title: 'Facade', duration: '10:02', bpm: null, key: 'Open' }, { id: 'fr4', title: 'Interior', duration: '7:44', bpm: null, key: 'Open' }, { id: 'fr5', title: 'Architect', duration: '14:58', bpm: null, key: 'Open' } ], description: 'Post-rock that builds slowly and collapses with intention. Five movements, one structure.', streamCount: 82000, vinylSold: 153 },

  { id: 'threshold', title: 'Threshold', artist: 'Drift Commune', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_a3.svg', year: 2023, catalogNumber: 'DC-002', genre: 'Experimental', formats: ['Digital', 'Vinyl LP'], vinylPrice: 20.00, downloadPrice: 1.00, duration: '47:10', tags: ['experimental', 'texture', 'drone', 'abstract'], credits: { producer: 'Drift Commune', recordedAt: 'Various locations', mastering: 'S. Arnaud', artwork: 'Drift Commune' }, tracks: [ { id: 'drc1', title: 'Liminal', duration: '11:02', bpm: null, key: 'Open' }, { id: 'drc2', title: 'Before', duration: '9:44', bpm: null, key: 'Open' }, { id: 'drc3', title: 'Threshold', duration: '13:22', bpm: null, key: 'Open' }, { id: 'drc4', title: 'After', duration: '13:02', bpm: null, key: 'Open' } ], description: 'An hour in the space between states. Experimental music at the point of no return.', streamCount: 48000, vinylSold: 94 },

  { id: 'quiet-hours', title: 'Quiet Hours', artist: 'M. Folio', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_a4.svg', year: 2025, catalogNumber: 'QSJ-216', genre: 'Solo Piano / Ambient', formats: ['Digital', 'Vinyl LP'], vinylPrice: 22.00, downloadPrice: 1.00, duration: '52:00', tags: ['solo piano', 'ambient', 'classical', 'quiet'], credits: { producer: 'M. Folio', recordedAt: 'Salle Pleyel, Paris', mastering: 'C. Morel', artwork: 'M. Folio' }, tracks: [ { id: 'mf1', title: 'Before Dawn', duration: '8:12', bpm: null, key: 'C maj' }, { id: 'mf2', title: 'Morning Study', duration: '9:44', bpm: null, key: 'G maj' }, { id: 'mf3', title: 'Noon Piece', duration: '7:58', bpm: null, key: 'D maj' }, { id: 'mf4', title: 'Afternoon Sketch', duration: '10:22', bpm: null, key: 'A maj' }, { id: 'mf5', title: 'Quiet Hours', duration: '15:44', bpm: null, key: 'F maj' } ], description: 'Five solo piano pieces composed for the body\'s quietest moments. Profoundly calm.', streamCount: 94000, vinylSold: 162 },

  { id: 'spectral', title: 'Spectral', artist: 'The Void Garden', artistId: 'nebulous-state', label: 'Self-Released', labelId: 'self-released', cover: '/album_a5.svg', year: 2024, catalogNumber: 'VG-001', genre: 'Psychedelic Ambient', formats: ['Digital', 'Vinyl LP'], vinylPrice: 24.00, downloadPrice: 1.10, duration: '55:20', tags: ['psychedelic', 'ambient', 'color', 'experimental'], credits: { producer: 'The Void Garden', recordedAt: 'Studio Fantôme, Paris', mastering: 'S. Arnaud', artwork: 'The Void Garden' }, tracks: [ { id: 'vg1', title: 'Violet', duration: '9:44', bpm: null, key: 'Open' }, { id: 'vg2', title: 'Indigo', duration: '8:12', bpm: null, key: 'Open' }, { id: 'vg3', title: 'Blue Shift', duration: '10:02', bpm: null, key: 'Open' }, { id: 'vg4', title: 'Green Frequency', duration: '9:44', bpm: null, key: 'Open' }, { id: 'vg5', title: 'Spectral', duration: '17:38', bpm: null, key: 'Open' } ], description: 'Full-spectrum psychedelic ambient in five color movements. Hallucinatory but controlled.', streamCount: 62000, vinylSold: 118 },

  { id: 'interlude-asha', title: 'Interlude', artist: 'Asha Rivers', artistId: 'marcus-cole', label: 'Quiet Storm Jazz', labelId: 'quiet-storm-jazz', cover: '/album_a6.svg', year: 2025, catalogNumber: 'QSJ-217', genre: 'Contemporary Classical', formats: ['Digital', 'Vinyl LP'], vinylPrice: 25.00, downloadPrice: 1.20, duration: '49:10', tags: ['classical', 'contemporary', 'string quartet', 'elegant'], credits: { producer: 'Asha Rivers', recordedAt: 'Barbican Hall, London', mastering: 'S. Ellis', artwork: 'A. Rivers' }, tracks: [ { id: 'ar1', title: 'Prelude', duration: '6:44', bpm: null, key: 'E maj' }, { id: 'ar2', title: 'Interlude I', duration: '8:22', bpm: null, key: 'B maj' }, { id: 'ar3', title: 'Interlude II', duration: '9:10', bpm: null, key: 'F# maj' }, { id: 'ar4', title: 'Interlude III', duration: '7:44', bpm: null, key: 'C# maj' }, { id: 'ar5', title: 'Postlude', duration: '17:10', bpm: null, key: 'E maj' } ], description: 'Asha Rivers composes for string quartet with the restraint of a master and the voice of a beginner.', streamCount: 74000, vinylSold: 136 },
];


export const vinylMarketplace = [
  {
    id: 'vm1',
    release: 'Echo Chamber',
    releaseId: 'echo-chamber',
    artist: 'Void Rhythm',
    cover: '/album3.png',
    seller: 'Parallel Records Paris',
    sellerRating: 4.9,
    sellerSales: 1840,
    condition: 'Mint (M)',
    price: 28.00,
    shipping: 3.50,
    format: '12" Vinyl',
    genre: 'Minimal Techno',
    country: 'France',
    year: 2024,
    notes: 'Still sealed. Original pressing OBS-079.',
  },
  {
    id: 'vm2',
    release: 'Night Motion',
    releaseId: 'night-motion',
    artist: 'Marcus Cole Quartet',
    cover: '/album4.png',
    seller: 'Sounds of Jazz NYC',
    sellerRating: 4.8,
    sellerSales: 3240,
    condition: 'Near Mint (NM)',
    price: 34.00,
    shipping: 5.00,
    format: 'LP Vinyl',
    genre: 'Jazz',
    country: 'USA',
    year: 2024,
    notes: 'Light sleeve wear. Record plays perfectly.',
  },
  {
    id: 'vm3',
    release: 'Lunar Drift',
    releaseId: 'lunar-drift',
    artist: 'Nebulous State',
    cover: '/album2.png',
    seller: 'Collectronix',
    sellerRating: 4.7,
    sellerSales: 892,
    condition: 'Very Good Plus (VG+)',
    price: 24.00,
    shipping: 4.00,
    format: 'LP Vinyl',
    genre: 'Ambient',
    country: 'Germany',
    year: 2025,
    notes: 'One play. Very light hairlines. Excellent condition.',
  },
  {
    id: 'vm4',
    release: 'Void Sequence',
    releaseId: 'void-sequence',
    artist: 'Aura System',
    cover: '/album1.png',
    seller: 'HardWax Berlin',
    sellerRating: 5.0,
    sellerSales: 12400,
    condition: 'Mint (M)',
    price: 22.00,
    shipping: 4.00,
    format: '12" Vinyl',
    genre: 'Techno',
    country: 'Germany',
    year: 2025,
    notes: 'Brand new. Fresh from pressing plant.',
  },
];

export const djSets = [
  {
    id: 'dj1',
    title: 'Fabric Live 2026',
    artist: 'Aura System',
    artistId: 'aura-system',
    cover: '/artist1.svg',
    duration: '1:58:32',
    date: '2026-02-14',
    venue: 'Fabric London',
    genre: 'Techno / Dark',
    plays: 48200,
    type: 'djset',
    description: 'Recorded live in Room 1 at Fabric London during the label night. Peak hour techno from start to finish.',
  },
  {
    id: 'pod1',
    title: 'KYO Podcast #001 — Selections from the Catalog',
    artist: 'KYO Editorial',
    artistId: null,
    cover: '/label1.svg',
    duration: '0:58:00',
    date: '2026-03-01',
    venue: null,
    genre: 'Editorial / Multi-genre',
    plays: 22100,
    type: 'podcast',
    description: 'The first KYO editorial podcast. An hour of selections from across the catalog — jazz, techno, ambient, hip-hop.',
  },
];

export const playlists = [
  {
    id: 'pl1',
    title: 'Late Night Drive',
    description: 'Curated for empty highways and slow thoughts.',
    cover: '/album6.png',
    tracks: ['t1', 't8', 't12', 't14', 't30'],
    isAI: false,
    creator: 'You',
  },
  {
    id: 'pl2',
    title: 'AI: Hypnotic Continuous',
    description: 'Built by KYO AI based on your listening pattern.',
    cover: '/album3.png',
    tracks: ['t12', 't1', 't2', 't5', 't7'],
    isAI: true,
    creator: 'KYO AI',
    aiReason: 'You listened to Echo Chamber 3 times this week. KYO AI found 4 more tracks with similar BPM (128–140), minimal structure, and dark harmonic character.',
  },
];

// Payout simulation data
export const payoutData = {
  month: 'April 2026',
  subscriptionAmount: 9.99,
  phaseShare: 2.997,
  artistPool: 6.993,
  topArtists: [
    { name: 'Aura System', percent: 38, amount: 2.66, tracks: 42 },
    { name: 'Nebulous State', percent: 22, amount: 1.54, tracks: 28 },
    { name: 'Marcus Cole Quartet', percent: 18, amount: 1.26, tracks: 19 },
    { name: 'Klyde', percent: 14, amount: 0.98, tracks: 15 },
    { name: 'Others (3)', percent: 8, amount: 0.56, tracks: 9 },
  ],
  comparisonSpotify: 0.004,
};

// User profile mock
export const userProfile = {
  id: 'user1',
  name: 'Alex M.',
  email: 'alex@example.com',
  plan: 'Standard',
  planPrice: 9.99,
  joined: '2025-09-01',
  totalPlays: 2840,
  totalDownloads: 14,
  totalVinylOrders: 3,
  avatar: null,
};

// Dashboard mock (artist view)
export const dashboardData = {
  artist: artists[0],
  totalStreams: 284000,
  monthlyStreams: 18400,
  streamGrowth: +12.4,
  totalDownloads: 1840,
  downloadRevenue: 2208,
  vinylSold: 340,
  vinylRevenue: 6290,
  totalRevenue: 9840,
  monthlyRevenue: 842,
  payoutPending: 312.40,
  contractStatus: 'Active — Standard (70/30)',
  exclusivityAvailable: true,
  topTracks: [
    { id: 't1', title: 'Phase Gate', streams: 84000, downloads: 420, revenue: 504 },
    { id: 't5', title: 'Transmission Fault', streams: 72000, downloads: 380, revenue: 456 },
    { id: 't2', title: 'Subgrid', streams: 62000, downloads: 310, revenue: 372 },
    { id: 't7', title: 'Void Sequence', streams: 66000, downloads: 290, revenue: 348 },
  ],
  weeklyStreams: [12000, 14400, 11800, 16200, 18400, 17200, 18400],
};

// Creator's uploaded releases (real catalog)
export const creatorReleases = [
  {
    id: 'nucleo-profondo',
    title: 'Nucleo Profondo',
    artist: 'Formant Value',
    albumName: 'Nucleo Profondo',
    year: 2026,
    format: 'AIFF',
    visibility: 'private',
    genre: 'Electronic',
    duration: '--:--',
    uploadDate: '2026-04-14',
    gradient: 'linear-gradient(135deg, #0a0a12 0%, #1c0a2e 55%, #0d0519 100%)',
    accentColor: '#9b6dff',
    streams: 0,
    downloads: 0,
    comments: 0,
    feedback: 0,
    feedbackCount: 0,
    revenue: 0,
    tags: ['Electronic'],
  },
];

// ── User shelf data (Home page "My Music" section) ───────────

export const myPlaylists = [
  { id: 'mpl-1', title: 'Late Night Drive',   cover: '/album6.png', trackCount: 12 },
  { id: 'mpl-2', title: 'Focus Deep',          cover: '/album2.png', trackCount: 8  },
  { id: 'mpl-3', title: 'Sunday Ambient',      cover: '/album5.png', trackCount: 15 },
  { id: 'mpl-4', title: 'Raw Techno',          cover: '/album4.png', trackCount: 22 },
];

export const likedAlbums = [
  { id: 'lal-1', title: 'Void Sequence',       artist: 'Aura System',      cover: '/album1.png' },
  { id: 'lal-2', title: 'Phantom Lattice',     artist: 'Phantom Grid',     cover: '/album2.png' },
  { id: 'lal-3', title: 'Rituals of Erosion',  artist: 'The Null Pointer', cover: '/album3.png' },
  { id: 'lal-4', title: 'Signal Collapse',     artist: 'Nocturnal Axis',   cover: '/album5.png' },
  { id: 'lal-5', title: 'Entropy Loop',        artist: 'Formant Value',    cover: '/album4.png' },
];

export const savedPlaylists = [
  { id: 'spl-1', title: 'KYO: Dark Techno Mix',      cover: '/album4.png', curator: 'Kyoyu Editorial', trackCount: 24 },
  { id: 'spl-2', title: 'AI: Hypnotic Continuous',   cover: '/album3.png', curator: 'KYO AI',          trackCount: '∞', isAI: true },
  { id: 'spl-3', title: 'Drone & Isolationism',      cover: '/album6.png', curator: 'Wire Magazine',   trackCount: 18 },
  { id: 'spl-4', title: 'Warehouse Essentials',      cover: '/album1.png', curator: 'RA Editorial',    trackCount: 31 },
];

export const artistRadios = [
  { id: 'rad-1', name: 'Aura System Radio',      artist: 'Aura System',      artistId: 'aura-system',    cover: '/album1.png' },
  { id: 'rad-2', name: 'Phantom Grid Radio',     artist: 'Phantom Grid',     artistId: 'phantom-grid',   cover: '/album2.png' },
  { id: 'rad-3', name: 'The Null Pointer Radio', artist: 'The Null Pointer', artistId: 'null-pointer',   cover: '/album3.png' },
  { id: 'rad-4', name: 'Nocturnal Axis Radio',   artist: 'Nocturnal Axis',   artistId: 'nocturnal-axis', cover: '/album5.png' },
  { id: 'rad-5', name: 'Formant Value Radio',    artist: 'Formant Value',    artistId: 'formant-value',  cover: '/album4.png' },
];

export const merchItems = [
  { id: 'merch-1', title: 'Aura System — Tee',       artist: 'Aura System',      cover: '/album1.png', price: '€28' },
  { id: 'merch-2', title: 'Obsidian Records Hoodie',  artist: 'Obsidian Records', cover: '/album4.png', price: '€65' },
  { id: 'merch-3', title: 'Phantom Grid Tote',        artist: 'Phantom Grid',     cover: '/album2.png', price: '€18' },
  { id: 'merch-4', title: 'Null Pointer Patch Set',   artist: 'The Null Pointer', cover: '/album3.png', price: '€12' },
  { id: 'merch-5', title: 'Nocturnal Axis Cap',       artist: 'Nocturnal Axis',   cover: '/album5.png', price: '€32' },
];

export const upcomingEvents = [
  { id: 'evt-1', title: 'Aura System — Live',         venue: 'Tresor, Berlin',      date: 'May 3',  cover: '/album1.png' },
  { id: 'evt-2', title: 'Phantom Grid — Boiler Room', venue: 'Fabric, London',      date: 'May 11', cover: '/album2.png' },
  { id: 'evt-3', title: 'Nocturnal Axis — Night',     venue: 'Rex Club, Paris',     date: 'May 18', cover: '/album5.png' },
  { id: 'evt-4', title: 'Null Pointer — Festival',    venue: 'Dekmantel, AMS',      date: 'Jun 1',  cover: '/album3.png' },
  { id: 'evt-5', title: 'Formant Value — Closing',    venue: 'De School, AMS',      date: 'Jun 7',  cover: '/album4.png' },
];
