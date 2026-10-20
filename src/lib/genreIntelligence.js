// Musicmap-inspired (https://musicmap.info/) Genre Intelligence & Discovery Layer
// Provides:
// 1. Canonical Genre Ontology (Super-Genres, Genres, Aliases '/', Sibling Groups '&', Origins, BPM/Rhythm, Genealogy Graph)
// 2. Multi-Signal Track Genre Classifier (works across Spotify, SoundCloud, Apple Music, Tidal, Bandcamp, YouTube, Discogs, Native)
// 3. Knowledge Graph & Live Contextual Enrichment for GenreSheetView

const _norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/[^a-z0-9/&+\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const _slug = (s) =>
  _norm(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ─────────────────────────────────────────────────────────────────────────────
// 1. CANONICAL MUSICMAP ONTOLOGY
// ─────────────────────────────────────────────────────────────────────────────

export const RAW_GENRE_NODES = [
  // ═══ TECHNO SUPER-GENRE ═══
  {
    name: 'Detroit Techno',
    aliases: ['First Wave Detroit Techno', 'Second Wave Detroit Techno', 'Hi-Tech Soul'],
    siblingGroup: 'Detroit Techno & Electro-Techno',
    superGenre: 'Techno',
    secondarySuperGenre: 'Rhythm \'n\' Blues (R&B)',
    originYear: 'Mid-1980s (c. 1985–1988)',
    originPlace: 'Detroit, Michigan, USA',
    bpmRange: '124–136 BPM',
    rhythmProfile: 'Syncopated TR-909 and TR-808 drum machine grooves paired with soulful, futuristic analog synthesizer melodies and funk-inflected basslines.',
    sonicTraits: ['Roland TR-909', 'Futuristic Synth Strings', 'Analog Warmth', 'Afrofuturism', 'Soulful Chords', 'Motorik Drive'],
    description: 'Born in mid-1980s Detroit through the Belleville Three (Juan Atkins, Derrick May, Kevin Saunderson) and Underground Resistance, Detroit Techno fused European synth-pop and Krautrock (Kraftwerk, Tangerine Dream) with American P-Funk, electro, and post-disco. Described by Derrick May as "George Clinton and Kraftwerk stuck in an elevator," it established techno not merely as functional club music, but as an expressive, Afrofuturist statement about post-industrial urban life and technological transcendence.',
    parentGenres: ['Electro', 'Chicago House', 'Synth-Pop', 'P-Funk'],
    influences: ['Krautrock / Kosmische', 'Post-Disco', 'Boogie', 'Italo Disco'],
    subgenres: ['Dub Techno', 'Minimal Techno', 'Ambient Techno', 'Hypnotic Techno', 'Hardgroove'],
    adjacentGenres: ['Electro', 'Acid Techno', 'Deep Techno', 'Chicago House', 'Tech House'],
    backlashAgainst: ['Commercial Pop', 'Formulaic Disco'],
    pioneerArtists: ['Juan Atkins', 'Derrick May', 'Kevin Saunderson', 'Jeff Mills', 'Robert Hood', 'Underground Resistance', 'Drexciya', 'Carl Craig', 'Moodymann', 'Octave One', 'Kenny Larkin'],
    classicLabels: ['Metroplex', 'Transmat', 'KMS', 'Underground Resistance', 'Axis', 'Planet E', 'Plus 8', 'Red Planet', 'Submerge', 'Tresor'],
    eventContexts: ['The Music Institute (Detroit)', 'Movement Electronic Music Festival (DEMF)', 'Tresor (Berlin)', 'Submerge Headquarters'],
    referenceTracks: [
      { title: 'Strings of Life', artist: 'Rhythim Is Rhythim', year: '1987', label: 'Transmat' },
      { title: 'No UFO\'s', artist: 'Model 500', year: '1985', label: 'Metroplex' },
      { title: 'The Bells', artist: 'Jeff Mills', year: '1996', label: 'Purpose Maker' },
      { title: 'Knights of the Jaguar', artist: 'DJ Rolando', year: '1999', label: 'Underground Resistance' },
      { title: 'Good Life', artist: 'Inner City', year: '1988', label: 'KMS' },
    ],
  },
  {
    name: 'Dub Techno',
    aliases: ['Basic Channel Sound', 'Chord Techno', 'Ambient Dub Techno'],
    siblingGroup: 'Dub Techno & Deep Techno',
    superGenre: 'Techno',
    secondarySuperGenre: 'Jamaican / Reggae',
    originYear: 'Early 1990s (c. 1992–1994)',
    originPlace: 'Berlin, Germany & Detroit, USA',
    bpmRange: '114–126 BPM',
    rhythmProfile: 'Submerged 4/4 pulse anchored by deep sub-bass, syncopated minor-chord synth stabs, and infinite tape delay / spring reverb feedback loops.',
    sonicTraits: ['Tape Echo & Space Delay', 'Minor-7th Chords', 'Vinyl Crackle & Noise Floor', 'Cavernous Reverb', 'Sub-Bass Weight', 'Hypnotic Immersion'],
    description: 'Pioneered in early-1990s Berlin by Moritz von Oswald and Mark Ernestus under their Basic Channel, Maurizio, and Rhythm & Sound aliases, Dub Techno marries the structural minimalism of Detroit Techno with the studio-as-instrument spatial production techniques of 1970s Jamaican King Tubby and Lee "Scratch" Perry dub. Characterized by filtered minor-chord stabs echoing through analog tape delays, warm vinyl hiss, and tectonic sub-bass, it bridges meditative home listening and deep, smoke-filled club sound systems.',
    parentGenres: ['Detroit Techno', 'Dub', 'Minimal Techno'],
    influences: ['Ambient Techno', 'Roots Reggae', 'Deep House', 'Minimalism'],
    subgenres: ['Ambient Dub', 'Deep Techno', 'Hypnotic Techno'],
    adjacentGenres: ['Ambient Techno', 'Minimal Techno', 'Deep Techno', 'Deep House', 'IDM / Braindance'],
    backlashAgainst: ['Mainstage Rave', 'Commercial Euro-Trance'],
    pioneerArtists: ['Basic Channel', 'Maurizio', 'Rhythm & Sound', 'DeepChord', 'Rod Modell', 'Porter Ricks', 'Fluxion', 'Monolake', 'Vladislav Delay', 'cv313', 'Yagya', 'Convextion', 'Prince of Denmark'],
    classicLabels: ['Basic Channel', 'Chain Reaction', 'Maurizio', 'Burial Mix', 'Echospace [Detroit]', 'Silent Season', 'Delsin', 'Giegling', 'echocord', 'Styrax Leaves'],
    eventContexts: ['Hard Wax (Berlin)', 'Tresor Basement', 'Berghain', 'Labyrinth Festival (Naeba)', 'Atonal Berlin'],
    referenceTracks: [
      { title: 'Phylyps Trak', artist: 'Basic Channel', year: '1993', label: 'Basic Channel' },
      { title: 'M-4', artist: 'Maurizio', year: '1995', label: 'Maurizio' },
      { title: 'Biokinetics', artist: 'Porter Ricks', year: '1996', label: 'Chain Reaction' },
      { title: 'Vantage Isle', artist: 'DeepChord presents Echospace', year: '2007', label: 'Modern Love' },
      { title: 'Mango Drive', artist: 'Rhythm & Sound', year: '1998', label: 'Rhythm & Sound' },
    ],
  },
  {
    name: 'Hypnotic Techno',
    aliases: ['Deep Techno', 'Sci-Fi Techno', 'Modular Techno', 'Atmospheric Techno'],
    siblingGroup: 'Hypnotic Techno & Deep Techno',
    superGenre: 'Techno',
    secondarySuperGenre: 'Downtempo / Ambient',
    originYear: 'Late 1990s – 2010s',
    originPlace: 'Berlin, Amsterdam, Madrid, Stockholm & Bristol',
    bpmRange: '126–138 BPM',
    rhythmProfile: 'Relentless, polyrhythmic, loop-driven percussion with evolving FM/modular synth sequences designed for extended, multi-deck DJ layering.',
    sonicTraits: ['Polyrhythmic Loops', 'Modular Synthesis', 'FM Textures', 'Mental / Trippy', 'Deep Sub-Bass', 'Warehouse Atmosphere'],
    description: 'Evolving from Jeff Mills\'s Purpose Maker loops, Sandwell District\'s post-minimalist aesthetic, and deep European warehouse culture, Hypnotic & Deep Techno focuses on psychoacoustic immersion rather than dramatic drops. Built around interlocking polyrhythms, modular bleeps, and slowly morphing timbral shifts, it thrives in long-form DJ sets where tracks are blended across three or four decks to create a continuous, trance-inducing sonic architecture.',
    parentGenres: ['Detroit Techno', 'Minimal Techno', 'Dub Techno'],
    influences: ['Ambient Techno', 'Industrial Techno', 'IDM / Braindance', 'Tribal House'],
    subgenres: ['Modular Techno', 'Raw / Groove Techno', 'Atmospheric Techno'],
    adjacentGenres: ['Dub Techno', 'Minimal Techno', 'Industrial Techno', 'Ambient Techno', 'Electro'],
    backlashAgainst: ['EDM Drop Culture', 'Business Techno'],
    pioneerArtists: ['Forest Drive West', 'Rrose', 'Donato Dozzy', 'Voices From The Lake', 'DVS1', 'Oscar Mulero', 'Surgeon', 'Regis', 'Function', 'Silent Servant', 'Kangding Ray', 'Luigi Tozzi', 'Claudio PRC', 'Abdulla Rashim', 'Blawan'],
    classicLabels: ['Delsin', 'Mantis', 'Ilian Tape', 'Semantica Records', 'Northern Electronics', 'PoleGroup', 'Warm Up Recordings', 'Sandwell District', 'Ostgut Ton', 'Token', 'Mord', 'Stroboscopic Artefacts', 'Livity Sound', 'Prologue', 'Tresor'],
    eventContexts: ['Berghain (Berlin)', 'Bassiani (Tbilisi)', 'De School / Radion (Amsterdam)', 'Labyrinth Festival (Japan)', 'Draaimolen Festival', 'Monument Festival'],
    referenceTracks: [
      { title: 'Mantis 01', artist: 'Forest Drive West', year: '2020', label: 'Delsin — Mantis' },
      { title: 'Waterfall', artist: 'Rrose', year: '2011', label: 'Sandwell District' },
      { title: 'Involve', artist: 'Voices From The Lake', year: '2012', label: 'Prologue' },
      { title: 'Black Russian', artist: 'DVS1', year: '2014', label: 'Klockworks' },
      { title: '200', artist: 'Function & Regis', year: '2010', label: 'Sandwell District' },
    ],
  },
  {
    name: 'Minimal Techno',
    aliases: ['Minimal', 'Microhouse / Minimal', 'Stripped Techno'],
    siblingGroup: 'Minimal Techno & Microhouse',
    superGenre: 'Techno',
    secondarySuperGenre: 'House',
    originYear: 'Early 1990s (c. 1992–1994)',
    originPlace: 'Detroit, USA & Cologne / Berlin, Germany',
    bpmRange: '122–132 BPM',
    rhythmProfile: 'Skeletal, stripped-back drum programming where micro-variations in hi-hats, clicks, and basslines carry the entire groove.',
    sonicTraits: ['Skeletal Percussion', 'Micro-Edits', 'Negative Space', 'Subtle Modulation', 'Hypnotic Repetition'],
    description: 'Originating with Robert Hood\'s seminal 1994 album "Minimal Nation" and Daniel Bell\'s DBX records in Detroit, and later expanded by German producers around Kompakt, Perlon, and Minus, Minimal Techno strips away lush pads and rave anthems to expose the bare skeleton of rhythm and funk. Every click, rimshot, and filter movement occupies deliberate space, turning subtle timbral shifts into high-drama dancefloor moments.',
    parentGenres: ['Detroit Techno', 'Acid House', 'Chicago House'],
    influences: ['Minimalism', 'Glitch', 'Dub Techno'],
    subgenres: ['Microhouse', 'Rominimal', 'Minimal Dub'],
    adjacentGenres: ['Dub Techno', 'Tech House', 'Deep House', 'Hypnotic Techno', 'Glitch'],
    backlashAgainst: ['Maximalist Rave', 'Anthemic Trance'],
    pioneerArtists: ['Robert Hood', 'Daniel Bell', 'Richie Hawtin', 'Plastikman', 'Ricardo Villalobos', 'Zip', 'Wolfgang Voigt', 'Baby Ford', 'Akufen', 'Perlon'],
    classicLabels: ['M-Plant', 'Accelerate', 'Plus 8', 'Minus', 'Perlon', 'Kompakt', 'Playhouse', 'Klang Elektronik', 'Cabinet Records', 'nervoushorizon'],
    eventContexts: ['Club der Visionaere (Berlin)', 'Panorama Bar (Berlin)', 'Robert Johnson (Offenbach)', 'Sunwaves Festival (Romania)', 'Mutek (Montreal)'],
    referenceTracks: [
      { title: 'Unix', artist: 'Robert Hood', year: '1994', label: 'Axis' },
      { title: 'Losing Control', artist: 'DBX', year: '1994', label: 'Accelerate' },
      { title: 'Spastik', artist: 'Plastikman', year: '1993', label: 'Plus 8' },
      { title: 'Easy Lee', artist: 'Ricardo Villalobos', year: '2003', label: 'Playhouse' },
    ],
  },
  {
    name: 'Industrial Techno',
    aliases: ['Birmingham Techno', 'Hard Industrial Techno', 'Post-Industrial Techno'],
    siblingGroup: 'Industrial Techno & EBM Techno',
    superGenre: 'Techno',
    secondarySuperGenre: 'Industrial & Gothic',
    originYear: 'Mid-1990s (c. 1994–1997)',
    originPlace: 'Birmingham & London, UK / Berlin, Germany',
    bpmRange: '132–145 BPM',
    rhythmProfile: 'Overdriven, metallic, clanging percussion, distorted kick drums, and abrasive noise textures driven by relentless mechanical momentum.',
    sonicTraits: ['Distorted Kick Drum', 'Metallic Percussion', 'Atone / Noise Layers', 'Dystopian Atmosphere', 'Overdriven Analog'],
    description: 'Forged in mid-1990s Birmingham through the Downwards collective (Regis, Surgeon, Female) and later expanded across Berlin and Rotterdam, Industrial Techno fuses the raw rhythmic discipline of Detroit Techno with the abrasive textures of early UK industrial, post-punk, and EBM (Throbbing Gristle, Cabaret Voltaire, DAF). It replaces melodic euphoria with raw physical intensity, metallic clangor, and stark brutalist acoustics.',
    parentGenres: ['Detroit Techno', 'Industrial', 'EBM (Electronic Body Music)'],
    influences: ['Noise', 'Post-Punk', 'Hardcore Techno', 'Schranz'],
    subgenres: ['Schranz', 'Rhythmic Noise', 'Techno Body Music (TBM)'],
    adjacentGenres: ['Hypnotic Techno', 'EBM (Electronic Body Music)', 'Acid Techno', 'Hard Techno', 'Electro'],
    backlashAgainst: ['Commercial House', 'Melodic Trance'],
    pioneerArtists: ['Surgeon', 'Regis', 'British Murder Boys', 'Ancient Methods', 'Perc', 'Paula Temple', 'Orphx', 'Phase Fatale', 'SNTS', 'Helena Hauff', 'Blawan', 'Karenn'],
    classicLabels: ['Downwards', 'Counterbalance', 'Tresor', 'Perc Trax', 'Mord', 'aufnahme + wiedergabe', 'Sonic Groove', 'Hospital Productions', 'Blueprint', 'Token'],
    eventContexts: ['House of God (Birmingham)', 'Tresor Vault (Berlin)', 'Berghain', 'Katharsis (Amsterdam)', 'Atonal Berlin'],
    referenceTracks: [
      { title: 'Atol', artist: 'Surgeon', year: '1995', label: 'Downwards' },
      { title: 'Speak To Me', artist: 'Regis', year: '1996', label: 'Downwards' },
      { title: 'Fist', artist: 'British Murder Boys', year: '2004', label: 'Downwards' },
      { title: 'Why They Hide Their Bodies Under My Garage?', artist: 'Blawan', year: '2012', label: 'Hinge Finger' },
    ],
  },
  {
    name: 'Acid Techno',
    aliases: ['303 Techno', 'London Acid Techno', 'Acid'],
    siblingGroup: 'Acid Techno & Acid House',
    superGenre: 'Techno',
    secondarySuperGenre: 'House',
    originYear: 'Early 1990s (c. 1991–1993)',
    originPlace: 'London, UK & Chicago / Detroit, USA',
    bpmRange: '130–145 BPM',
    rhythmProfile: 'Driving 4/4 techno drums locked with squelching, resonant, overdriven Roland TB-303 basslines.',
    sonicTraits: ['Roland TB-303', 'Resonant Filter Sweep', 'Distorted Squelch', 'Rave Energy', '909 Ride Cymbal'],
    description: 'Emerging from the early-1990s UK squat-party scene (Stay Up Forever, Liberator DJs) and Plastikman/Hardfloor experiments, Acid Techno pushes the Roland TB-303 bass synthesizer into faster, harder, and more hypnotic territory than Chicago Acid House. Defined by twisting cutoff and resonance knobs over pounding TR-909 percussion, it remains a cornerstone of warehouse raves and underground peak-time sets.',
    parentGenres: ['Acid House', 'Detroit Techno', 'Hardcore Techno'],
    influences: ['New Beat', 'Trance', 'Industrial Techno'],
    subgenres: ['Acid Core', 'Acid Trance'],
    adjacentGenres: ['Acid House', 'Detroit Techno', 'Industrial Techno', 'Hardgroove', 'Electro'],
    backlashAgainst: ['Radio Pop'],
    pioneerArtists: ['Hardfloor', 'Plastikman', 'Chris Liberator', 'Dave The Drummer', 'Luke Vibert', 'Josh Wink', 'Emmanuel Top', 'Boston 168', '999999999', 'Tin Man'],
    classicLabels: ['Stay Up Forever', 'Harthouse', 'Plus 8', 'Smitten', ' Hydraulix', 'Acid Test', ' Clone'],
    eventContexts: ['London Squat Raves', 'Awakenings (Amsterdam)', 'I Love Acid'],
    referenceTracks: [
      { title: 'Acperience 1', artist: 'Hardfloor', year: '1992', label: 'Harthouse' },
      { title: 'Turkish Bazar', artist: 'Emmanuel Top', year: '1994', label: 'Attack Records' },
      { title: 'Higher State of Consciousness', artist: 'Josh Wink', year: '1995', label: 'Strictly Rhythm' },
    ],
  },
  {
    name: 'Ambient Techno',
    aliases: ['Intelligent Techno', 'Artificial Intelligence Techno', 'Atmospheric Electronic'],
    siblingGroup: 'Ambient Techno & IDM',
    superGenre: 'Techno',
    secondarySuperGenre: 'Downtempo / Ambient',
    originYear: 'Early 1990s (c. 1991–1993)',
    originPlace: 'Sheffield & London, UK / Detroit, USA / Amsterdam, NL',
    bpmRange: '100–128 BPM',
    rhythmProfile: 'Delicate, intricate drum machine patterns floating inside expansive, cinematic synthesizer pads and crystalline melodies.',
    sonicTraits: ['Lush Analog Pads', 'Crystalline Arpeggios', 'Deep Space Atmosphere', 'Intricate Drum Programming', 'Emotional Melodies'],
    description: 'Coalescing around Warp Records\' landmark 1992 "Artificial Intelligence" series, R&S/Apollo Records, and Delsin, Ambient Techno brings the harmonic beauty of Brian Eno\'s ambient music together with the rhythmic pulse and emotional synth work of Detroit Techno. Equal parts contemplative home-listening music and sunrise dancefloor catharsis, it laid the direct foundation for IDM and modern melodic/atmospheric electronics.',
    parentGenres: ['Detroit Techno', 'Ambient', 'Acid House'],
    influences: ['Krautrock / Kosmische', 'Synth-Pop', 'Fourth World'],
    subgenres: ['IDM / Braindance', 'Dub Techno', 'Ambient House'],
    adjacentGenres: ['IDM / Braindance', 'Dub Techno', 'Ambient', 'Hypnotic Techno', 'Electro'],
    backlashAgainst: ['Hardcore Rave'],
    pioneerArtists: ['Aphex Twin', 'B12', 'The Black Dog', 'Global Communication', 'Biosphere', 'Carl Craig', 'Convextion', 'Susumu Yokota', 'Skee Mask', 'Barker', 'upsammy'],
    classicLabels: ['Warp Records', 'Apollo', 'R&S Records', 'Delsin', 'Ilian Tape', 'Applied Rhythmic Technology (ART)', 'GPR', 'Peacefrog', 'Leisure System'],
    eventContexts: ['Lost (London)', 'Atonal (Berlin)', 'DekmantelSelectors', 'Mutek'],
    referenceTracks: [
      { title: 'Xtal', artist: 'Aphex Twin', year: '1992', label: 'Apollo / R&S' },
      { title: '73-Yips', artist: 'B12', year: '1993', label: 'Warp Records' },
      { title: '14:31', artist: 'Global Communication', year: '1994', label: 'Dedicated' },
      { title: 'Flyby VFR', artist: 'Skee Mask', year: '2018', label: 'Ilian Tape' },
    ],
  },

  // ═══ HOUSE SUPER-GENRE ═══
  {
    name: 'Chicago House',
    aliases: ['Classic House', 'Warehouse House', 'Jackin\' House'],
    siblingGroup: 'Chicago House & Acid House',
    superGenre: 'House',
    secondarySuperGenre: 'Rhythm \'n\' Blues (R&B)',
    originYear: 'Early 1980s (c. 1981–1985)',
    originPlace: 'Chicago, Illinois, USA',
    bpmRange: '118–126 BPM',
    rhythmProfile: 'Four-on-the-floor kick drum, crisp open hi-hats on the off-beats, handclaps on 2 and 4, and syncopated Roland TR-707/808/909 "jack" grooves.',
    sonicTraits: ['4/4 Kick Drum', 'Roland TR-707 / TR-909', 'Gospel Piano Chords', 'Soulful Diva Vocals', 'Raw Analog Basslines'],
    description: 'Named after Chicago\'s legendary Warehouse club where Frankie Knuckles mixed disco, Philly soul, Salsoul classics, and European synth records over reel-to-reel tape edits and drum machines, Chicago House is the foundational bedrock of modern club music. Producers like Larry Heard (Mr. Fingers), Marshall Jefferson, Ron Hardy, and Adonis stripped disco down to raw drum machines and synthesizers, giving birth to a global movement.',
    parentGenres: ['Disco', 'Post-Disco', 'Boogie', 'Gospel'],
    influences: ['Italo Disco', 'Electro', 'Synth-Pop', 'Philly Soul'],
    subgenres: ['Deep House', 'Acid House', 'Garage House', 'Ghetto House', 'Tech House'],
    adjacentGenres: ['Deep House', 'Acid House', 'Detroit Techno', 'Garage House', 'Disco'],
    backlashAgainst: [' Rockist "Disco Demolition" Backlash'],
    pioneerArtists: ['Frankie Knuckles', 'Larry Heard', 'Mr. Fingers', 'Ron Hardy', 'Marshall Jefferson', 'Adonis', 'Farley "Jackmaster" Funk', 'Lil Louis', 'Green Velvet', 'Derrick Carter'],
    classicLabels: ['Trax Records', 'DJ International Records', 'Alleviated Records', 'Cajual Records', 'Relief Records', 'Dance Mania'],
    eventContexts: ['The Warehouse (Chicago)', 'The Music Box (Chicago)', 'Smartbar (Chicago)'],
    referenceTracks: [
      { title: 'Your Love', artist: 'Frankie Knuckles', year: '1987', label: 'Trax Records' },
      { title: 'Can You Feel It', artist: 'Mr. Fingers', year: '1986', label: 'Trax Records' },
      { title: 'Move Your Body', artist: 'Marshall Jefferson', year: '1986', label: 'Trax Records' },
      { title: 'No Way Back', artist: 'Adonis', year: '1986', label: 'Trax Records' },
    ],
  },
  {
    name: 'Deep House',
    aliases: ['Soulful Deep House', 'Jazz House', 'Underground Deep House'],
    siblingGroup: 'Deep House & Garage House',
    superGenre: 'House',
    secondarySuperGenre: 'Jazz',
    originYear: 'Mid-to-Late 1980s (c. 1986–1989)',
    originPlace: 'Chicago, New York & Detroit, USA',
    bpmRange: '116–124 BPM',
    rhythmProfile: 'Warm, swinging 4/4 drums with shuffled hi-hats, Fender Rhodes electric pianos, extended minor-9th jazz chords, and soulful basslines.',
    sonicTraits: ['Fender Rhodes & Lush Pads', 'Extended Jazz Chords (Min9 / Maj7)', 'Warm Sub-Bass', 'Swinging Hi-Hats', 'Intimate Vocal Samples'],
    description: 'Initiated by Larry Heard\'s lush, introspective productions ("Can You Feel It", "Mystery of Love") and refined across New York, New Jersey, and Detroit by Kerri Chandler, Moodymann, Theo Parrish, and Ron Trent, Deep House infuses the 4/4 house framework with the harmonic sophistication of jazz-funk, soul, and gospel. Prioritizing warmth, groove, and emotional depth over peak-time aggression, it remains one of the most enduring forms of electronic music.',
    parentGenres: ['Chicago House', 'Jazz-Funk', 'Soul / Gospel'],
    influences: ['Disco', 'Boogie', 'Detroit Techno', 'Dub'],
    subgenres: ['Lo-Fi House', 'Microhouse', 'Afro House', 'Organic House'],
    adjacentGenres: ['Chicago House', 'Garage House', 'Dub Techno', 'Detroit Techno', 'Minimal Techno', 'Broken Beat'],
    backlashAgainst: ['Commercial Big-Room House'],
    pioneerArtists: ['Larry Heard', 'Kerri Chandler', 'Theo Parrish', 'Moodymann', 'Ron Trent', 'Chez Damier', 'Omar-S', 'Move D', 'Fred P', 'Soichi Terada', 'Chaos In The CBD'],
    classicLabels: ['Alleviated Records', 'Prescription', 'Sound Signature', 'Mahogani Music', 'FXHE Records', 'Strictly Rhythm', 'Nervous Records', 'Rush Hour', 'Workshop', 'Giegling'],
    eventContexts: ['Paradise Garage (NYC)', 'The Loft (NYC)', 'Panorama Bar (Berlin)', 'Dekmantel Festival (Amsterdam)'],
    referenceTracks: [
      { title: 'Atmosphere (Kerri\'s Foundation Dub)', artist: 'Kerri Chandler', year: '1993', label: 'Shelter Records' },
      { title: 'Altered States', artist: 'Ron Trent', year: '1990', label: 'Warehouse' },
      { title: 'Shades of Jae', artist: 'Moodymann', year: '1999', label: 'KDJ' },
      { title: 'Falling Up', artist: 'Theo Parrish', year: '1997', label: 'Third Ear' },
    ],
  },
  {
    name: 'Acid House',
    aliases: ['Chicago Acid', 'Second Summer of Love'],
    siblingGroup: 'Acid House & Chicago House',
    superGenre: 'House',
    secondarySuperGenre: 'Techno',
    originYear: 'Mid-1980s (c. 1986–1988)',
    originPlace: 'Chicago, USA & London / Manchester, UK',
    bpmRange: '120–128 BPM',
    rhythmProfile: 'Hypnotic 4/4 drum machine patterns driven by liquid, squelching Roland TB-303 basslines.',
    sonicTraits: ['Roland TB-303 Squelch', 'TR-808 / TR-707 Drums', 'Resonant Filter Modulation', 'Psychedelic Minimalism'],
    description: 'Born in 1986 when Chicago trio Phuture (DJ Pierre, Spanky, Herb J) pushed a cheap, discarded Roland TB-303 bass synthesizer beyond its intended limits on "Acid Tracks," Acid House turned resonant filter sweeps into the lead voice of dance music. Exporting to the UK in 1987–1988, it ignited the Second Summer of Love, transforming youth culture, clubbing, and the entire trajectory of European electronic music.',
    parentGenres: ['Chicago House', 'Electro', 'Hi-NRG'],
    influences: ['Italo Disco', 'Industrial'],
    subgenres: ['Acid Techno', 'Breakbeat Hardcore', 'Madchester / Baggy'],
    adjacentGenres: ['Chicago House', 'Acid Techno', 'Detroit Techno', 'Electro', 'Breakbeat Hardcore'],
    backlashAgainst: ['Slick Mainstream Pop'],
    pioneerArtists: ['Phuture', 'DJ Pierre', ' Armando', '808 State', 'A Guy Called Gerald', 'paranoid london', 'Sleezy D'],
    classicLabels: ['Trax Records', 'DJ International', 'Warp Records', 'R&S Records', 'Clone Jack For Daze', 'Paranoid London Records'],
    eventContexts: ['The Music Box (Chicago)', 'Shoom (London)', 'The Haçienda (Manchester)'],
    referenceTracks: [
      { title: 'Acid Tracks', artist: 'Phuture', year: '1987', label: 'Trax Records' },
      { title: 'Voodoo Ray', artist: 'A Guy Called Gerald', year: '1988', label: 'Rham!' },
      { title: 'Pacific State', artist: '808 State', year: '1989', label: 'ZTT' },
    ],
  },
  {
    name: 'Tech House',
    aliases: ['UK Tech House', 'Groove Tech House'],
    siblingGroup: 'Tech House & Minimal House',
    superGenre: 'House',
    secondarySuperGenre: 'Techno',
    originYear: 'Mid-1990s (c. 1994–1998)',
    originPlace: 'London, UK & US Midwest',
    bpmRange: '124–130 BPM',
    rhythmProfile: 'Punchy, synthetic techno drum design combined with the warm, swinging low-end groove and arrangement of house music.',
    sonicTraits: ['Rolling Bassline', 'Crisp Synthetic Percussion', 'Swinging Groove', 'Club-Focused Dynamics'],
    description: 'Coined in mid-1990s London around the Wiggle and Heart & Soul club nights (Terry Francis, Nathan Coles, Mr. C), Tech House bridges the soulful swing and basslines of American house with the precision sound design and driving percussion of techno.',
    parentGenres: ['Deep House', 'Minimal Techno', 'Detroit Techno'],
    influences: ['Chicago House', 'Progressive House', 'UK Garage / 2-Step'],
    subgenres: ['Minimal Tech', 'Deep Tech'],
    adjacentGenres: ['Deep House', 'Minimal Techno', 'Chicago House', 'Detroit Techno'],
    backlashAgainst: ['Cheesy Vocal House'],
    pioneerArtists: ['Terry Francis', 'Mr. C', 'Herbert', 'Layo & Bushwacka!', 'Green Velvet', 'Jamie Jones', 'Seth Troxler', 'Craig Richards'],
    classicLabels: ['Pagan', 'Eukahouse', 'End Recordings', 'Cajual', 'Crosstown Rebels', 'Fabric'],
    eventContexts: ['Fabric Room 1 (London)', 'The End (London)', 'DC10 (Ibiza)'],
    referenceTracks: [
      { title: 'Losing Control', artist: 'Terry Francis', year: '1997', label: 'Pagan' },
      { title: 'La La Land', artist: 'Green Velvet', year: '2001', label: 'Relief' },
    ],
  },

  // ═══ BREAKBEAT & ELECTRO SUPER-GENRE ═══
  {
    name: 'Electro',
    aliases: ['Electro-Funk', 'Detroit Electro', 'Techno-Bass'],
    siblingGroup: 'Electro & Techno-Bass',
    superGenre: 'Breakbeat',
    secondarySuperGenre: 'Techno',
    originYear: 'Early 1980s (c. 1982) & 1990s Detroit Wave',
    originPlace: 'New York & Detroit, USA / The Hague, Netherlands',
    bpmRange: '124–142 BPM',
    rhythmProfile: 'Syncopated, broken Roland TR-808 drum patterns with booming sub-bass kicks, crisp snares, vocoders, and dystopian analog synth leads.',
    sonicTraits: ['Roland TR-808', 'Syncopated Broken Beat', 'Vocoder & Robotic Voices', 'Sci-Fi / Aquatic Mythology', 'Analog Arpeggios'],
    description: 'Sparked in 1982 by Afrika Bambaataa\'s "Planet Rock" (which fused Kraftwerk\'s "Trans-Europe Express" with TR-808 rhythms) and Cybotron\'s "Clear" in Detroit, Electro evolved from early hip-hop/funk dance music into a futuristic underground force. In the 1990s, Detroit\'s Drexciya, Aux 88, and Dopplereffekt—alongside The Hague\'s Bunker/Viewlexx scene (I-F, Legowelt)—transformed Electro into a dark, aquatic, sci-fi sibling of techno.',
    parentGenres: ['Synth-Pop', 'P-Funk', 'Old School Hip Hop'],
    influences: ['Krautrock / Kosmische', 'Boogie', 'Italo Disco'],
    subgenres: ['Detroit Techno', 'Miami Bass', 'Ghetto Tech', 'Skweee'],
    adjacentGenres: ['Detroit Techno', 'Acid Techno', 'IDM / Braindance', 'Breakbeat', 'UK Bass / Leftfield Bass'],
    backlashAgainst: ['Four-on-the-Floor Monotony'],
    pioneerArtists: ['Drexciya', 'Cybotron', 'Dopplereffekt', 'Aux 88', 'Afrika Bambaataa', 'Egyptian Lover', 'Helena Hauff', 'DJ Stingray 313', 'I-F', 'Legowelt', 'Jensen Interceptor', 'Client_03'],
    classicLabels: ['Underground Resistance', 'Clone Aqualung Series', 'Warp Records', 'Direct Beat', 'Bunker Records', 'Viewlexx', 'Central Processing Unit (CPU)', 'Tresor', 'Cultivated Electronics', 'Return To Disorder'],
    eventContexts: ['Tresor (Berlin)', 'Golden Pudel (Hamburg)', 'Dekmantel The Hague Stage', 'Movement Detroit'],
    referenceTracks: [
      { title: 'Clear', artist: 'Cybotron', year: '1983', label: 'Fantasy' },
      { title: 'Andreaen Sand Dunes', artist: 'Drexciya', year: '1999', label: 'Tresor' },
      { title: 'Space Invaders Are Smoking Grass', artist: 'I-F', year: '1997', label: 'Viewlexx' },
      { title: 'Scientist', artist: 'Dopplereffekt', year: '1999', label: 'International Deejay Gigolo' },
    ],
  },
  {
    name: 'UK Bass / Leftfield Bass',
    aliases: ['Post-Dubstep', 'Bristol Techno-Bass', '2-Step / Bass Hybrid', 'Weightless / UK Bass'],
    siblingGroup: 'UK Bass & Leftfield Techno',
    superGenre: 'Breakbeat',
    secondarySuperGenre: 'Techno',
    originYear: 'Late 2000s – 2010s (c. 2008–present)',
    originPlace: 'Bristol, London & Manchester, UK',
    bpmRange: '126–142 BPM',
    rhythmProfile: 'Broken, swung UK sound-system percussion combining sub-heavy dubstep weight, fractured garage shuffles, and driving techno tension.',
    sonicTraits: ['Sub-System Bass Weight', 'Broken / Stepping Percussion', 'Dubwise Space', 'Swung UK Groove', 'Metallic Sound Design'],
    description: 'Emerging from the fertile collision of dubstep, UK funky, garage, jungle, and European techno in late-2000s London and Bristol, UK Bass / Leftfield Bass refuses strict 4/4 or half-time templates.championed by labels like Hessle Audio, Livity Sound, Timedance, and Ilian Tape, artists such as Pearson Sound, Peverelist, Batu, Objekt, Joy Orbison, and Skee Mask craft forward-thinking club music anchored by Jamaican sound-system sub-bass and intricate broken rhythms.',
    parentGenres: ['Dubstep', 'UK Garage / 2-Step', 'Hypnotic Techno', 'Jungle'],
    influences: ['Dub', 'Electro', 'IDM / Braindance', 'Grime'],
    subgenres: ['Deconstructed Club', 'Bristol Sound System Techno'],
    adjacentGenres: ['Hypnotic Techno', 'Dubstep', 'Electro', 'Jungle', 'UK Garage / 2-Step', 'Ambient Techno'],
    backlashAgainst: ['Brostep', 'Formulaic Tech House'],
    pioneerArtists: ['Pearson Sound', 'Peverelist', 'Batu', 'Joy Orbison', 'Ben UFO', 'Pangaea', 'Objekt', 'Skee Mask', 'Hodge', 'Ploy', 'SimooCell', 'Overmono', 'Two Shell'],
    classicLabels: ['Hessle Audio', 'Livity Sound', 'Timedance', 'Ilian Tape', 'Hemlock Recordings', 'Whities / AD 93', 'Tectonic', 'Wisdom Teeth', 'Hinge Finger'],
    eventContexts: ['FWD>> (London)', 'Strange Brew / Cosies (Bristol)', 'Fabric Room 2', 'Dekmantel UFO II', 'Freerotation'],
    referenceTracks: [
      { title: 'Hyph Mngo', artist: 'Joy Orbison', year: '2009', label: 'Hotflush' },
      { title: 'Theme From Q', artist: 'Objekt', year: '2017', label: 'Objekt' },
      { title: 'Roll With The Punches', artist: 'Peverelist', year: '2007', label: 'Punch Drunk' },
      { title: 'Compro', artist: 'Skee Mask', year: '2018', label: 'Ilian Tape' },
    ],
  },
  {
    name: 'Breakbeat',
    aliases: ['Nu Skool Breaks', 'Progressive Breaks', 'Leftfield Breaks'],
    siblingGroup: 'Breakbeat & Electro Breaks',
    superGenre: 'Breakbeat',
    secondarySuperGenre: 'House',
    originYear: 'Late 1980s – 1990s',
    originPlace: 'UK & USA',
    bpmRange: '124–138 BPM',
    rhythmProfile: 'Sampled or programmed syncopated drum breaks (Funky Drummer, Amen, Think, Apache) driving bass-heavy electronic arrangements.',
    sonicTraits: ['Chopped Drum Breaks', 'Syncopated Snares', 'Reese / Sub Bass', 'Rave Stabs'],
    description: 'Rooted in hip-hop DJs isolating funk drum solos ("breaks") on twin turntables, Breakbeat evolved in the late 1980s and 1990s into a vast electronic spectrum spanning Breakbeat Hardcore, Big Beat, Nu Skool Breaks, and contemporary leftfield club breaks.',
    parentGenres: ['Funk', 'Old School Hip Hop', 'Acid House'],
    influences: ['Electro', 'Jungle', 'Techno'],
    subgenres: ['Breakbeat Hardcore', 'Big Beat', 'Progressive Breaks'],
    adjacentGenres: ['Electro', 'Jungle', 'UK Bass / Leftfield Bass', 'UK Garage / 2-Step'],
    backlashAgainst: ['Rigid 4/4 House'],
    pioneerArtists: ['The Prodigy', 'Bicep', 'Overmono', 'Special Request', 'Plump DJs', 'Stanton Warriors', 'DJ Icey', 'Rennie Pilgrem'],
    classicLabels: ['XL Recordings', 'Finger Lickin\' Records', 'Marine Parade', 'Ninja Tune', 'Ilian Tape', 'Feel My Bicep'],
    eventContexts: ['Fabric (London)', 'Warehouse Project (Manchester)', 'Glade Stage (Glastonbury)'],
    referenceTracks: [
      { title: 'Out of Space', artist: 'The Prodigy', year: '1992', label: 'XL Recordings' },
      { title: 'Glue', artist: 'Bicep', year: '2017', label: 'Ninja Tune' },
      { title: 'So U Kno', artist: 'Overmono', year: '2021', label: 'XL Recordings' },
    ],
  },

  // ═══ DRUM 'N' BASS / JUNGLE SUPER-GENRE ═══
  {
    name: 'Jungle',
    aliases: ['Ragga Jungle', 'Original Jungle', 'Darkcore Jungle'],
    siblingGroup: 'Jungle & Drum \'n\' Bass',
    superGenre: 'Drum \'n\' Bass / Jungle',
    secondarySuperGenre: 'Jamaican / Reggae',
    originYear: 'Early 1990s (c. 1991–1994)',
    originPlace: 'London & Bristol, UK',
    bpmRange: '155–172 BPM',
    rhythmProfile: 'Frenetic, time-stretched and pitched-up Amen/Think/Apache breakbeats riding over half-time, chest-rattling Jamaican sound-system 808 sub-bass.',
    sonicTraits: ['Chopped Amen Break', 'Half-Time 808 Sub-Bass', 'Time-Stretched Vocals', 'Ragga / Dancehall Samples', 'Dub Sirens'],
    description: 'Emerging from early-1990s multicultural London pirate radio (Kool FM) and Breakbeat Hardcore raves (Rage at Heaven), Jungle is one of Britain\'s most radical musical inventions. By speeding up 1960s funk drum breaks (most famously The Winstons\' "Amen, Brother") to 160+ BPM while anchoring them with slow, half-time Jamaican dub/dancehall basslines, producers like Goldie, LTJ Bukem, 4hero, Dillinja, and Shy FX created a polyrhythmic sound-system revolution.',
    parentGenres: ['Breakbeat Hardcore', 'Dub', 'Dancehall / Ragga', 'Hip Hop'],
    influences: ['Detroit Techno', 'Jazz-Funk', 'Rare Groove'],
    subgenres: ['Drum \'n\' Bass', 'Atmospheric / Intelligent Jungle', 'Drumfunk', 'Breakcore'],
    adjacentGenres: ['Drum \'n\' Bass', 'Breakbeat', 'UK Bass / Leftfield Bass', 'Dubstep', 'Footwork / Juke'],
    backlashAgainst: ['Commercial Eurodance'],
    pioneerArtists: ['Goldie', 'LTJ Bukem', '4hero', 'Roni Size', 'Dillinja', 'Photek', 'Source Direct', 'Omni Trio', 'Shy FX', 'Remarc', 'Sully', 'Tim Reaper', 'Nia Archives'],
    classicLabels: ['Metalheadz', 'Moving Shadow', 'Reinforced Records', 'Good Looking Records', 'Suburban Base', 'V Recordings', 'Astrophonica', 'Future Retro London'],
    eventContexts: ['Rage at Heaven (London)', 'Metalheadz at Blue Note (Hoxton)', 'Kool FM Pirate Radio', 'Notting Hill Carnival'],
    referenceTracks: [
      { title: 'Inner City Life', artist: 'Goldie', year: '1994', label: 'Metalheadz' },
      { title: 'Original Nuttah', artist: 'UK Apachi & Shy FX', year: '1994', label: 'SOUR' },
      { title: 'Atlantis (I Need You)', artist: 'LTJ Bukem', year: '1993', label: 'Good Looking Records' },
      { title: 'Renegade Snares (Foul Play VIP)', artist: 'Omni Trio', year: '1993', label: 'Moving Shadow' },
    ],
  },
  {
    name: 'Drum \'n\' Bass',
    aliases: ['DnB', 'Techstep / Neurofunk / Liquid DnB', 'Autonomic'],
    siblingGroup: 'Drum \'n\' Bass & Jungle',
    superGenre: 'Drum \'n\' Bass / Jungle',
    secondarySuperGenre: 'Breakbeat',
    originYear: 'Mid-1990s (c. 1995–present)',
    originPlace: 'London, Bristol & Manchester, UK',
    bpmRange: '168–176 BPM',
    rhythmProfile: 'High-velocity two-step and rolling breakbeats at ~170–174 BPM paired with heavily sculpted Reese basslines or deep sub-bass.',
    sonicTraits: ['170+ BPM Rolling Breaks', 'Reese Bass', 'Two-Step Snare Pattern', 'Precision Sound Design', 'Sub-Bass Pressure'],
    description: 'Evolving directly out of Jungle in the mid-1990s, Drum \'n\' Bass streamlined the chaotic ragga-sampled breakbeat aesthetic into a sleek, futuristic high-tempo architecture. Branching into dark sci-fi Techstep and Neurofunk (Ed Rush & Optical, Konflict), soulful Liquid Funk (Calibre, Marcus Intalex, High Contrast), Minimal/Deep DnB (dBridge, Alix Perez), and 170 BPM half-time/Autonomic experiments (Instra:mental, ASC, Samurai Music), it remains a global sound-system powerhouse.',
    parentGenres: ['Jungle', 'Breakbeat Hardcore', 'Detroit Techno'],
    influences: ['Jazz Fusion', 'Soul', 'Dub', 'Industrial'],
    subgenres: ['Liquid Drum \'n\' Bass', 'Techstep / Neurofunk', 'Minimal / Deep DnB', 'Autonomic / Halftime'],
    adjacentGenres: ['Jungle', 'UK Bass / Leftfield Bass', 'Dubstep', 'Breakbeat', 'Footwork / Juke'],
    backlashAgainst: ['Mid-Tempo Club Norms'],
    pioneerArtists: ['Calibre', 'dBridge', 'Photek', 'Ed Rush & Optical', 'Marcus Intalex', 'Roni Size', 'Andy C', 'Noisia', 'Alix Perez', 'ASC', 'Bop', 'Loxy', 'Doc Scott'],
    classicLabels: ['Metalheadz', 'Exit Records', 'Signature Recordings', 'Soul:r', 'RAM Records', 'Virus Recordings', 'Hospital Records', '31 Records', 'Samurai Music', '1985 Music', 'Critical Music'],
    eventContexts: ['Metalheadz at Blue Note', 'Fabriclive (London)', 'SunAndBass (Sardinia)', 'Hospitality'],
    referenceTracks: [
      { title: 'Ni Ten Ichi Ryu', artist: 'Photek', year: '1997', label: 'Science' },
      { title: 'Mr. Majestic', artist: 'Calibre & High Contrast', year: '2004', label: 'Signature' },
      { title: 'Bleak', artist: 'dBridge & Vegas', year: '2003', label: 'Bad Company' },
      { title: 'Alien Girl', artist: 'Ed Rush, Optical & Fierce', year: '1998', label: 'Prototype' },
    ],
  },

  // ═══ UK GARAGE, DUBSTEP & FOOTWORK ═══
  {
    name: 'UK Garage / 2-Step',
    aliases: ['UKG', '2-Step Garage', 'Speed Garage'],
    siblingGroup: 'UK Garage & 2-Step',
    superGenre: 'House',
    secondarySuperGenre: 'Breakbeat',
    originYear: 'Mid-to-Late 1990s (c. 1994–2000)',
    originPlace: 'London, UK',
    bpmRange: '128–136 BPM',
    rhythmProfile: 'Syncopated, skipping "two-step" drum patterns that omit the 2nd and 4th kick drums, swung hi-hats, chopped R&B vocals, and warped sub-bass.',
    sonicTraits: ['Skipping 2-Step Beat', 'Chopped & Pitch-Shifted R&B Vocals', 'Swung Shuffle', 'Warped Organ / Sub Bass'],
    description: 'Born when London DJs sped up American New Jersey/New York Garage House records and infused them with Jungle\'s sub-bass weight and syncopated snare programming, UK Garage (and its 2-Step evolution) defined turn-of-the-millennium British club culture and directly birthed both Grime and Dubstep.',
    parentGenres: ['Garage House', 'Deep House', 'Jungle', 'Contemporary R&B'],
    influences: ['Dancehall', 'Soulful House'],
    subgenres: ['Dubstep', 'Grime', 'Bassline / Niche', 'Future Garage'],
    adjacentGenres: ['Dubstep', 'UK Bass / Leftfield Bass', 'Deep House', 'Grime', 'Breakbeat'],
    backlashAgainst: ['Hard Trance'],
    pioneerArtists: ['MJ Cole', 'Todd Edwards', 'El-B', 'Zed Bias', 'Wookie', 'Horsepower Productions', 'Burial', 'Interplanetary Criminal', 'Sammy Virji'],
    classicLabels: ['Locked On', 'Ghost', 'Tempa', 'Hyperdub', 'Shall Not Fade', 'Time Is Now'],
    eventContexts: ['FWD>> at Velvet Rooms (London)', 'Twice As Nice', 'Rinse FM'],
    referenceTracks: [
      { title: 'Sincere', artist: 'MJ Cole', year: '1998', label: 'Talkin\' Loud' },
      { title: 'Neighbourhood', artist: 'Zed Bias', year: '2000', label: 'Locked On' },
      { title: 'Archangel', artist: 'Burial', year: '2007', label: 'Hyperdub' },
    ],
  },
  {
    name: 'Dubstep',
    aliases: ['140 / Deep Dubstep', 'South London Dubstep', ' Original Dubstep'],
    siblingGroup: 'Dubstep & Grime',
    superGenre: 'Breakbeat',
    secondarySuperGenre: 'Jamaican / Reggae',
    originYear: 'Early 2000s (c. 2001–2006)',
    originPlace: 'Croydon & South London, UK',
    bpmRange: '138–142 BPM',
    rhythmProfile: 'Sparse, half-time snare on the 3rd beat at 140 BPM with cavernous space and physical, chest-compressing sub-bass.',
    sonicTraits: ['140 BPM Half-Time Pulse', 'Sub-Bass Weight (30–60 Hz)', 'Dark 2-Step Swing', 'DubEcho & Space'],
    description: 'Originating in Croydon and South London around Big Apple Records, FWD>> club nights, and Rinse FM, original Dubstep stripped 2-Step UK Garage down to dark, minimal, dub-inspired instrumentals at 140 BPM. Spearheaded by Mala & Coki (Digital Mystikz), Skream, Benga, Loefah, Kode9, and Burial, it turned sub-bass frequencies into a tactile architectural medium.',
    parentGenres: ['UK Garage / 2-Step', 'Dub', 'Jungle'],
    influences: ['Grime', 'Dub Techno', 'Dancehall'],
    subgenres: ['UK Bass / Leftfield Bass', 'Future Garage'],
    adjacentGenres: ['UK Garage / 2-Step', 'UK Bass / Leftfield Bass', 'Grime', 'Dub', 'Jungle'],
    backlashAgainst: ['Champagne-fuelled Commercial UKG'],
    pioneerArtists: ['Mala', 'Digital Mystikz', 'Skream', 'Benga', 'Loefah', 'Burial', 'Kode9', 'Shackleton', 'Pinch', 'Kahn & Neek'],
    classicLabels: ['DMZ', 'Tempa', 'Hyperdub', 'Deep Medi Musik', 'Tectonic', 'Skull Disco', 'Punch Drunk', 'Innamind Recordings'],
    eventContexts: ['DMZ at Mass (Brixton)', 'FWD>> at Plastic People (London)', 'Rinse FM', 'Outlook Festival'],
    referenceTracks: [
      { title: 'Anti War Dub', artist: 'Digital Mystikz', year: '2006', label: 'DMZ' },
      { title: 'Midnight Request Line', artist: 'Skream', year: '2005', label: 'Tempa' },
      { title: 'Horror Show', artist: 'Loefah', year: '2004', label: 'DMZ' },
      { title: 'Untrue', artist: 'Burial', year: '2007', label: 'Hyperdub' },
    ],
  },
  {
    name: 'Footwork / Juke',
    aliases: ['Chicago Footwork', 'Juke', '160 Club'],
    siblingGroup: 'Footwork & Juke',
    superGenre: 'Breakbeat',
    secondarySuperGenre: 'House',
    originYear: 'Late 1990s – 2000s',
    originPlace: 'Chicago, Illinois, USA',
    bpmRange: '155–165 BPM',
    rhythmProfile: 'Hyper-syncopated, triplet-heavy TR-808 sub-bass and tom patterns at 160 BPM with rapid-fire chopped soul/rap vocal loops.',
    sonicTraits: ['160 BPM Polyrhythms', 'Rapid Vocal Micro-Samples', 'Roland TR-808 Sub Kicks', 'Syncopated Tom Rolls'],
    description: 'Evolving from Chicago Ghetto House via RP Boo, DJ Rashad, DJ Spinn, and the Teklife crew, Footwork pushes drum machine syncopation to 160 BPM to accompany high-speed competitive street dance battles, bridging Chicago\'s house heritage with Jungle and experimental bass.',
    parentGenres: ['Chicago House', 'Ghetto House', 'Miami Bass'],
    influences: ['Jungle', 'Hip Hop', 'Soul'],
    subgenres: ['Jungle Footwork', 'Halftime 160'],
    adjacentGenres: ['Jungle', 'Drum \'n\' Bass', 'Electro', 'UK Bass / Leftfield Bass'],
    backlashAgainst: ['Predictable 4/4 Structures'],
    pioneerArtists: ['DJ Rashad', 'RP Boo', 'DJ Spinn', 'Traxman', 'Jlin', 'DJ Manny', 'Sully'],
    classicLabels: ['Planet Mu', 'Teklife', 'Hyperdub', 'Dance Mania', 'Astrophonica'],
    eventContexts: ['Battlegroundz (Chicago)', 'Bangana', 'Unsound Festival'],
    referenceTracks: [
      { title: 'Double Cup', artist: 'DJ Rashad', year: '2013', label: 'Hyperdub' },
      { title: 'Baby Come On', artist: 'RP Boo', year: '1997', label: 'Dance Mania' },
    ],
  },

  // ═══ DOWNTEMPO / AMBIENT / IDM SUPER-GENRE ═══
  {
    name: 'IDM / Braindance',
    aliases: ['Intelligent Dance Music', 'Braindance', 'Experimental Electronica'],
    siblingGroup: 'IDM & Glitch',
    superGenre: 'Downtempo / Ambient',
    secondarySuperGenre: 'Techno',
    originYear: 'Early 1990s (c. 1992–1996)',
    originPlace: 'Sheffield, Cornwall & London, UK',
    bpmRange: '80–160 BPM (Variable / Asymmetrical)',
    rhythmProfile: 'Intricately programmed, non-linear drum patterns, algorithmic micro-edits, drill-speed snares, and melancholic analog melodies.',
    sonicTraits: ['Complex Micro-Rhythms', 'Melancholic Analog Synths', 'Glitch & DSP Processing', 'Modular Patching', 'Nostalgic Tape Boards'],
    description: 'Growing out of Ambient Techno and UK rave culture in the early 1990s through Aphex Twin, Autechre, Boards of Canada, Squarepusher, and Drexciya, IDM (often called "Braindance" by Rephlex Records to avoid elitism) pushed electronic production beyond club utility into deeply personal, experimental territory—combining fractured, hyper-detailed percussion with haunting harmonic warmth.',
    parentGenres: ['Ambient Techno', 'Electro', 'Acid House', 'Ambient'],
    influences: ['Musique Concrète', 'Jungle', 'Industrial', 'Krautrock / Kosmische'],
    subgenres: ['Glitch', 'Drill \'n\' Bass', 'Hauntology'],
    adjacentGenres: ['Ambient Techno', 'Ambient', 'Electro', 'Dub Techno', 'Leftfield / Experimental'],
    backlashAgainst: ['Formulaic Club Templates'],
    pioneerArtists: ['Aphex Twin', 'Autechre', 'Boards of Canada', 'Squarepusher', 'Four Tet', 'Clark', 'Plaid', 'μ-Ziq', 'Mouse on Mars', 'Oneohtrix Point Never', 'Objekt', 'Skee Mask'],
    classicLabels: ['Warp Records', 'Rephlex', 'Skam', 'Planet Mu', 'Ghostly International', 'Ninja Tune', 'Raster-Noton', 'Ilian Tape', 'Delsin', 'Editions Mego'],
    eventContexts: ['Atonal (Berlin)', 'Mutek', 'Unsound (Kraków)', 'Mira Festival (Barcelona)'],
    referenceTracks: [
      { title: 'Windowlicker', artist: 'Aphex Twin', year: '1999', label: 'Warp Records' },
      { title: 'Roygbiv', artist: 'Boards of Canada', year: '1998', label: 'Warp / Skam' },
      { title: 'Nil', artist: 'Autechre', year: '1994', label: 'Warp Records' },
    ],
  },
  {
    name: 'Ambient',
    aliases: ['Ambient Drone', 'Space Ambient', 'Environmental / Fourth World Ambient'],
    siblingGroup: 'Ambient & Drone',
    superGenre: 'Downtempo / Ambient',
    secondarySuperGenre: 'Classical',
    originYear: '1970s (c. 1973–1978)',
    originPlace: 'London, UK / Germany / Japan / USA',
    bpmRange: 'Beatless / Free-Time (40–90 BPM pulse)',
    rhythmProfile: 'Beatless or slow-breathing generative loops, tape delays, sustained harmonic drones, and acoustic/environmental field recordings.',
    sonicTraits: ['Sustained Drones', 'Tape Loops & Generative Systems', 'Field Recordings', 'Lush Reverb', 'Harmonic Stillness'],
    description: 'Coined by Brian Eno in 1978 with "Ambient 1: Music for Airports" as music "as ignorable as it is interesting," Ambient grew from Erik Satie\'s "furniture music," 1960s minimalism (La Monte Young, Terry Riley), German Kosmische (Tangerine Dream, Klaus Schulze), and Japanese Kankyō Ongaku (Hiroshi Yoshimura, Midori Takada). It prioritizes tone, atmosphere, spatial depth, and psychoacoustic immersion over conventional rhythm and song structure.',
    parentGenres: ['Minimalism', 'Krautrock / Kosmische', 'Experimental / Avant-Garde'],
    influences: ['Dub', 'Musique Concrète', 'Modal Jazz'],
    subgenres: ['Ambient Techno', 'Dark Ambient', 'Drone', 'Kankyō Ongaku (Japanese Ambient)'],
    adjacentGenres: ['Ambient Techno', 'Dub Techno', 'IDM / Braindance', 'Downtempo', 'Modern Classical / Neoclassical'],
    backlashAgainst: ['Hyper-Commodified Pop'],
    pioneerArtists: ['Brian Eno', 'Hiroshi Yoshimura', 'Laraaji', 'William Basinski', 'Stars of the Lid', 'Grouper', 'Tim Hecker', 'Biosphere', 'KLF', 'The Orb', 'Caterina Barbieri', 'Huerco S.', 'KMRU'],
    classicLabels: ['Editions EG', 'Warp Records', 'kranky', '12k', 'Touch', 'West Mineral Ltd.', 'Silent Season', 'RVNG Intl.', 'Shelter Press', 'Room40'],
    eventContexts: ['Berlin Atonal', 'Le Guess Who? (Utrecht)', 'Unsound Ephemera', 'Labyrinth Chill-Out'],
    referenceTracks: [
      { title: '1/1', artist: 'Brian Eno', year: '1978', label: 'Editions EG' },
      { title: 'Green', artist: 'Hiroshi Yoshimura', year: '1986', label: 'Air Records' },
      { title: 'dlp 1.1', artist: 'William Basinski', year: '2002', label: '2062' },
      { title: 'For Those Of You Who Have Never (And Also Those Who Have)', artist: 'Huerco S.', year: '2016', label: 'Proibito' },
    ],
  },
  {
    name: 'Downtempo',
    aliases: ['Trip Hop', 'Bristol Sound', 'Chillout / Balearic'],
    siblingGroup: 'Downtempo & Trip Hop',
    superGenre: 'Downtempo / Ambient',
    secondarySuperGenre: 'Rap / Hip Hop',
    originYear: 'Early 1990s (c. 1990–1995)',
    originPlace: 'Bristol & London, UK / Ibiza, Spain',
    bpmRange: '70–105 BPM',
    rhythmProfile: 'Slow, dusty, head-nodding hip-hop breakbeats layered with dub basslines, cinematic strings, and smoky vocals.',
    sonicTraits: ['Slow Dusty Breaks', 'Dub Basslines', 'Cinematic Strings & Rhodes', 'Vinyl Warmth', 'Nocturnal Mood'],
    description: 'Originating in early-1990s Bristol (Massive Attack, Portishead, Tricky) and London\'s Mo\' Wax / Ninja Tune scenes, Downtempo & Trip Hop slowed hip-hop breakbeats down into a moody, dub-soaked, cinematic synthesis of soul, jazz, post-punk, and ambient electronics.',
    parentGenres: ['Hip Hop', 'Dub', 'Ambient', 'Soul'],
    influences: ['Jazz', 'Post-Punk', 'Film Scores'],
    subgenres: ['Trip Hop', 'Illbient', 'Lo-Fi Beats', 'Balearic Beat'],
    adjacentGenres: ['Ambient', 'Dub', 'Hip Hop', 'Nu Jazz / Broken Beat', 'IDM / Braindance'],
    backlashAgainst: ['Frenetic Rave Tempos'],
    pioneerArtists: ['Massive Attack', 'Portishead', 'Tricky', 'DJ Shadow', 'Nightmares on Wax', 'Kruder & Dorfmeister', 'Bonobo', 'Air', 'Thievery Corporation', 'Boards of Canada'],
    classicLabels: ['Wild Bunch / Virgin', 'Mo\' Wax', 'Ninja Tune', 'Warp Records', 'G-Stone Recordings', '!K7'],
    eventContexts: ['The DugOut (Bristol)', 'Café del Mar (Ibiza)', 'Worldwide Festival'],
    referenceTracks: [
      { title: 'Unfinished Sympathy', artist: 'Massive Attack', year: '1991', label: 'Wild Bunch' },
      { title: 'Roads', artist: 'Portishead', year: '1994', label: 'Go! Beat' },
      { title: 'Midnight in a Perfect World', artist: 'DJ Shadow', year: '1996', label: 'Mo\' Wax' },
    ],
  },

  // ═══ TRANCE SUPER-GENRE ═══
  {
    name: 'Trance',
    aliases: ['Classic Trance', 'Hypnotic Trance', 'Progressive / Hard Trance'],
    siblingGroup: 'Trance & Acid Trance',
    superGenre: 'Trance',
    secondarySuperGenre: 'Techno',
    originYear: 'Early 1990s (c. 1990–1994)',
    originPlace: 'Frankfurt & Berlin, Germany / Goa, India',
    bpmRange: '130–145 BPM',
    rhythmProfile: 'Driving 4/4 kick and rolling 16th-note basslines topped with hypnotic arpeggiated synthesizer leads and atmospheric breakdowns.',
    sonicTraits: ['16th-Note Arpeggios', 'Euphoric / Hypnotic Pads', 'Rolling Basslines', 'Acid Filter Sweeps'],
    description: 'Emerging in early-1990s Frankfurt (Sven Väth\'s Eye Q / Harthouse, Jam & Spoon) and Berlin (MFS, Cosmic Baby), early Trance combined the hypnotic repetition of techno with the soaring, arpeggiated synth melodies of German Kosmische music—a sound currently experiencing a major underground revival across contemporary techno and club scenes.',
    parentGenres: ['Detroit Techno', 'Acid House', 'Krautrock / Kosmische'],
    influences: ['Ambient', 'New Beat', 'Synth-Pop'],
    subgenres: ['Acid Trance', 'Progressive Trance', 'Psytrance / Goa Trance', 'Hard Trance'],
    adjacentGenres: ['Acid Techno', 'Hypnotic Techno', 'Progressive House', 'Detroit Techno'],
    backlashAgainst: ['Minimalist Stripped Techno'],
    pioneerArtists: ['Jam & Spoon', 'Sven Väth', 'Cosmic Baby', 'Paul van Dyk', 'Union Jack', 'LSG', 'Oliver Lieb', 'KI/KI', ' Schacke', 'Alpha Tracks'],
    classicLabels: ['Eye Q Records', 'Harthouse', 'Platipus', 'MFS', 'Superstition', 'Bonzai Records', 'Ute.Rec', 'Kulør'],
    eventContexts: ['Omen (Frankfurt)', 'Tresor (Berlin)', 'Goa Beach Parties'],
    referenceTracks: [
      { title: 'Age of Love (Jam & Spoon Watch Out For Stella Mix)', artist: 'The Age of Love', year: '1992', label: 'React' },
      { title: 'L\'Esperanza', artist: 'Sven Väth', year: '1993', label: 'Eye Q' },
    ],
  },

  // ═══ JAMAICAN / REGGAE & DUB SUPER-GENRE ═══
  {
    name: 'Dub',
    aliases: ['Jamaican Dub', 'Roots Dub', 'UK Stepper Dub'],
    siblingGroup: 'Dub & Roots Reggae',
    superGenre: 'Jamaican / Reggae',
    secondarySuperGenre: 'Downtempo / Ambient',
    originYear: 'Early 1970s (c. 1968–1974)',
    originPlace: 'Kingston, Jamaica & London, UK',
    bpmRange: '65–90 BPM (or 130–145 BPM Steppers)',
    rhythmProfile: 'One-drop or steppers drum-and-bass "riddim" stripped of lead vocals, with mixing-console faders dropping instruments in and out of cavernous tape echo and spring reverb.',
    sonicTraits: ['Spring Reverb & Roland Space Echo', 'Heavy Fender Precision Bass', 'One-Drop Rimshot', 'Mixing Desk as Instrument'],
    description: 'Invented in Kingston, Jamaica by sound engineers King Tubby, Lee "Scratch" Perry, Errol Thompson, and Scientist, Dub transformed the recording studio mixing console into a live performance instrument. By stripping reggae B-sides ("versions") down to drum and bass and sending fragments of horns, vocals, and snares through high-pass filters, spring reverb, and tape delay, Dub became the single most influential production language in all of modern electronic, hip-hop, post-punk, and bass music.',
    parentGenres: ['Roots Reggae', 'Rocksteady'],
    influences: ['Rhythm \'n\' Blues (R&B)', 'Nyabinghi'],
    subgenres: ['Dub Techno', 'Dubstep', 'Jungle', 'UK Steppers', 'Digital Dub / Dancehall'],
    adjacentGenres: ['Roots Reggae', 'Dub Techno', 'Dubstep', 'Jungle', 'Downtempo', 'Post-Punk'],
    backlashAgainst: ['Static Studio Recording Conventions'],
    pioneerArtists: ['King Tubby', 'Lee "Scratch" Perry', 'Scientist', 'Augustus Pablo', 'Keith Hudson', 'Jah Shaka', 'Adrian Sherwood', 'Mad Professor', 'Rhythm & Sound', 'ABA Shanti-I'],
    classicLabels: ['Studio One', 'Black Ark / Upsetter', 'Greensleeves', 'On-U Sound', 'Wackie\'s', 'Blood and Fire', 'Basic Channel / Burial Mix', 'Pressure Sounds'],
    eventContexts: ['Kingston Sound Systems', 'Jah Shaka Dances (London)', 'Notting Hill Carnival', 'University of Dub'],
    referenceTracks: [
      { title: 'King Tubby Meets Rockers Uptown', artist: 'Augustus Pablo', year: '1974', label: 'Yard Music' },
      { title: 'Super Ape', artist: 'The Upsetters', year: '1976', label: 'Island' },
      { title: 'Scientist Rids the World of the Evil Curse of the Vampires', artist: 'Scientist', year: '1981', label: 'Greensleeves' },
    ],
  },
  {
    name: 'Roots Reggae',
    aliases: ['Reggae', 'Rocksteady / Reggae', 'Dancehall / Lovers Rock'],
    siblingGroup: 'Roots Reggae & Dancehall',
    superGenre: 'Jamaican / Reggae',
    secondarySuperGenre: 'Rhythm \'n\' Blues (R&B)',
    originYear: 'Late 1960s – 1970s',
    originPlace: 'Kingston, Jamaica',
    bpmRange: '70–95 BPM',
    rhythmProfile: 'Off-beat guitar/organ "skank" chords with emphasis on the 3rd beat ("one-drop") and melodic, syncopated basslines.',
    sonicTraits: ['Off-Beat Guitar Skank', 'One-Drop Drum Pattern', 'Melodic Sub-Bass', 'Conscious Rastafari Lyrics'],
    description: 'Evolving from Ska and Rocksteady in late-1960s Jamaica, Roots Reggae slowed the tempo and elevated the bass guitar and drum kit to the forefront of the mix, pairing spiritual Rastafari consciousness and anti-colonial resistance with irresistible rhythmic groove.',
    parentGenres: ['Rocksteady', 'Ska', 'Rhythm \'n\' Blues (R&B)'],
    influences: ['Soul', 'Nyabinghi', 'Calypso / Mento'],
    subgenres: ['Dub', 'Dancehall', 'Lovers Rock', 'Ragga'],
    adjacentGenres: ['Dub', 'Soul / Funk', 'Afrobeat', 'Jungle', 'Dubstep'],
    backlashAgainst: ['Colonial Cultural Dominance'],
    pioneerArtists: ['Bob Marley & The Wailers', 'Burning Spear', 'The Congos', 'Horace Andy', 'Dennis Brown', 'Toots & The Maytals', 'Barrington Levy', 'Sister Nancy'],
    classicLabels: ['Studio One', 'Treasure Isle', 'Trojan Records', 'Island Records', 'VP Records', 'Greensleeves'],
    eventContexts: ['Kingston Lawn Dances', 'Notting Hill Carnival', 'Reggae Sumfest'],
    referenceTracks: [
      { title: 'Heart of the Congos', artist: 'The Congos', year: '1977', label: 'Black Art' },
      { title: 'Skylarking', artist: 'Horace Andy', year: '1972', label: 'Studio One' },
      { title: 'Bam Bam', artist: 'Sister Nancy', year: '1982', label: 'Techniques' },
    ],
  },

  // ═══ RAP / HIP HOP SUPER-GENRE ═══
  {
    name: 'Hip Hop / Boom Bap',
    aliases: ['Golden Age Hip Hop', 'Abstract / Underground Hip Hop', 'Instrumental Hip Hop'],
    siblingGroup: 'Boom Bap & Jazz Rap',
    superGenre: 'Rap / Hip Hop',
    secondarySuperGenre: 'Rhythm \'n\' Blues (R&B)',
    originYear: 'Late 1970s – 1990s',
    originPlace: 'New York, Los Angeles & Detroit, USA',
    bpmRange: '82–98 BPM',
    rhythmProfile: 'Sampled funk/soul/jazz breakbeats chopped on Akai MPC / SP-1200 samplers with unquantized swing, heavy kick ("boom"), and crisp snare ("bap").',
    sonicTraits: ['MPC / SP-1200 Drum Chop', 'Jazz & Soul Crate-Digging Samples', 'Unquantized Swing', 'Lyrical Intricate Flow'],
    description: 'Born at 1520 Sedgwick Avenue in the Bronx in 1973 when DJ Kool Herc isolated funk breakbeats for B-boys and MCs, Hip Hop evolved through the 1990s Golden Age into an art of crate-digging alchemy—exemplified by DJ Premier, Pete Rock, Q-Tip, J Dilla, Madlib, and MF DOOM.',
    parentGenres: ['Funk', 'Soul', 'Dub (Sound System Toasting)', 'Disco'],
    influences: ['Jazz', 'Blues', 'Electro'],
    subgenres: ['Jazz Rap', 'Abstract Hip Hop', 'Lo-Fi Beats', 'Trap', 'Grime'],
    adjacentGenres: ['Downtempo', 'Soul / Funk', 'Jazz', 'Trap', 'Grime', 'Breakbeat'],
    backlashAgainst: ['Polished Corporate Pop'],
    pioneerArtists: ['A Tribe Called Quest', 'Nas', 'Wu-Tang Clan', 'J Dilla', 'Madlib', 'MF DOOM', 'DJ Premier', 'Mobb Deep', 'OutKast', 'Kendrick Lamar', 'Earl Sweatshirt', 'The Alchemist'],
    classicLabels: ['Stones Throw Records', 'Rawkus Records', 'Def Jam', 'Tommy Boy', 'Loud Records', 'Rhymesayers', 'Lex Records', 'Warp Records'],
    eventContexts: ['Bronx Block Parties', 'Low End Theory (Los Angeles)', 'Lyricist Lounge (NYC)'],
    referenceTracks: [
      { title: 'N.Y. State of Mind', artist: 'Nas', year: '1994', label: 'Columbia' },
      { title: 'Accordion', artist: 'Madvillain', year: '2004', label: 'Stones Throw' },
      { title: 'Workinonit', artist: 'J Dilla', year: '2006', label: 'Stones Throw' },
    ],
  },
  {
    name: 'Trap / Cloud Rap / Drill',
    aliases: ['Southern Hip Hop / Trap', 'UK / Chicago Drill', 'Experimental Rap'],
    siblingGroup: 'Trap & Drill',
    superGenre: 'Rap / Hip Hop',
    secondarySuperGenre: 'Breakbeat',
    originYear: '2000s – 2010s',
    originPlace: 'Atlanta, Memphis, Houston & Chicago, USA / London, UK',
    bpmRange: '130–150 BPM (Half-Time Feel)',
    rhythmProfile: 'Booming pitched 808 sub-bass glides, rapid-fire triplet hi-hat rolls, and atmospheric, minor-key synthesizer melodies.',
    sonicTraits: ['808 Sub-Bass Glides', 'Triplet Hi-Hat Rolls', 'Half-Time Snare', 'Dark Minor-Key Synths'],
    description: 'Rooted in Atlanta, Memphis, and Houston bounce/crunk traditions (Three 6 Mafia, Shawty Redd, Zaytoven, Metro Boomin) and expanding globally into Cloud Rap and Chicago/UK Drill, Trap reshaped modern production around booming 808 bass glides and intricate hi-hat programming.',
    parentGenres: ['Hip Hop / Boom Bap', 'Miami Bass', 'Electro'],
    influences: ['Grime', 'Dubstep', 'Ambient'],
    subgenres: ['UK Drill', 'Cloud Rap', 'Rage / Plugg'],
    adjacentGenres: ['Hip Hop / Boom Bap', 'Grime', 'Dubstep', 'Contemporary R&B'],
    backlashAgainst: ['Traditional Sample-Only Purism'],
    pioneerArtists: ['Three 6 Mafia', 'Future', 'Young Thug', 'Travis Scott', 'Playboi Carti', 'Yung Lean', 'Bladee', 'Chief Keef', 'Skepta'],
    classicLabels: ['YEAR0001', 'AWGE', 'Quality Control', 'XL Recordings'],
    eventContexts: ['Magic City (Atlanta)', 'Rolling Loud', 'Rinse FM'],
    referenceTracks: [
      { title: 'March Madness', artist: 'Future', year: '2015', label: 'Freebandz' },
      { title: 'Ginseng Strip 2002', artist: 'Yung Lean', year: '2013', label: 'YEAR0001' },
    ],
  },
  {
    name: 'Grime',
    aliases: ['Eski-Beat', '8-Bar Grime', 'Instrumental Grime'],
    siblingGroup: 'Grime & Dubstep',
    superGenre: 'Rap / Hip Hop',
    secondarySuperGenre: 'Breakbeat',
    originYear: 'Early 2000s (c. 2001–2004)',
    originPlace: 'Bow & East London, UK',
    bpmRange: '138–142 BPM',
    rhythmProfile: 'Jagged, cold, syncopated 140 BPM rhythms built on FruityLoops / PlayStation Music 2000 with square-wave basslines and rapid-fire MC bars.',
    sonicTraits: ['140 BPM Jagged Beats', 'Square-Wave / Eskimo Synths', 'Pirate Radio Energy', 'Rapid MC Reloads'],
    description: 'Erupting from East London pirate radio stations (Rinse FM, Deja Vu) in the early 2000s via Wiley, Dizzee Rascal, Kano, and Skepta, Grime fused UK Garage, Jungle, and Dancehall sound-system clashes into a raw, cold, 140 BPM electronic voice of London youth.',
    parentGenres: ['UK Garage / 2-Step', 'Jungle', 'Dancehall'],
    influences: ['Hip Hop / Boom Bap', 'Industrial'],
    subgenres: ['Weightless Instrumental Grime', 'UK Drill'],
    adjacentGenres: ['Dubstep', 'UK Garage / 2-Step', 'UK Bass / Leftfield Bass', 'Jungle'],
    backlashAgainst: ['Polished Commercial UKG'],
    pioneerArtists: ['Wiley', 'Dizzee Rascal', 'Skepta', 'Kano', 'Ruff Sqwad', 'Novelist', 'Mumdance', 'Logos'],
    classicLabels: ['XL Recordings', 'Boy Better Know', 'Butterz', 'Tectonic', 'Boxed'],
    eventContexts: ['Rinse FM', 'Eskimo Dance', 'FWD>>'],
    referenceTracks: [
      { title: 'I Luv U', artist: 'Dizzee Rascal', year: '2003', label: 'XL Recordings' },
      { title: 'Morgue', artist: 'Wiley', year: '2004', label: 'run in thehythm' },
    ],
  },

  // ═══ JAZZ, SOUL, FUNK & DISCO SUPER-GENRES ═══
  {
    name: 'Jazz / Spiritual Jazz & Fusion',
    aliases: ['Spiritual Jazz', 'Modal Jazz / Jazz-Funk', 'Nu Jazz / UK Jazz'],
    siblingGroup: 'Spiritual Jazz, Modal Jazz & Jazz-Funk',
    superGenre: 'Jazz',
    secondarySuperGenre: 'Rhythm \'n\' Blues (R&B)',
    originYear: '1950s–1970s & Contemporary Revival',
    originPlace: 'New York, Chicago & Los Angeles, USA / London, UK',
    bpmRange: '60–140 BPM (Swung / Polyrhythmic)',
    rhythmProfile: 'Improvised polyrhythmic drumming, walking or syncopated upright/electric bass, extended modal harmony, and expressive horn/keyboard solos.',
    sonicTraits: ['Modal Improvisation', 'Fender Rhodes & Acoustic Piano', 'Saxophone & Trumpet Lead', 'Complex Polyrhythms'],
    description: 'From Miles Davis, John & Alice Coltrane, Pharoah Sanders, and Sun Ra\'s modal and spiritual explorations to Herbie Hancock and Lonnie Liston Smith\'s 1970s electric jazz-funk—and today\'s London/Chicago club-informed jazz renaissance (Yussef Dayes, Kamasi Washington, Floating Points, Nala Sinephro)—Jazz is the harmonic and rhythmic wellspring behind deep house, broken beat, hip-hop, and ambient music.',
    parentGenres: ['Blues', 'Gospel', 'Bebop'],
    influences: ['Classical', 'Afro-Cuban', 'Funk', 'Soul'],
    subgenres: ['Spiritual Jazz', 'Jazz-Funk', 'Broken Beat / Nu Jazz', 'Ambient Jazz'],
    adjacentGenres: ['Soul / Funk', 'Deep House', 'Hip Hop / Boom Bap', 'Ambient', 'Broken Beat'],
    backlashAgainst: ['Rigid Commercial Song Formulas'],
    pioneerArtists: ['Miles Davis', 'John Coltrane', 'Alice Coltrane', 'Pharoah Sanders', 'Herbie Hancock', 'Sun Ra', 'Lonnie Liston Smith', 'Floating Points', 'Nala Sinephro', 'Yussef Dayes', 'Kamasi Washington', 'Cortex'],
    classicLabels: ['Blue Note', 'Impulse!', 'ECM Records', 'Prestige', 'Strata-East', 'Black Jazz Records', 'Brownswood Recordings', 'International Anthem', 'Warp Records'],
    eventContexts: ['Village Vanguard (NYC)', 'Total Refreshment Centre (London)', 'We Out Here Festival'],
    referenceTracks: [
      { title: 'The Creator Has a Master Plan', artist: 'Pharoah Sanders', year: '1969', label: 'Impulse!' },
      { title: 'Journey in Satchidananda', artist: 'Alice Coltrane', year: '1971', label: 'Impulse!' },
      { title: 'Promises', artist: 'Floating Points, Pharoah Sanders & The London Symphony Orchestra', year: '2021', label: 'Luaka Bop' },
    ],
  },
  {
    name: 'Soul / Funk & Boogie',
    aliases: ['Funk', 'Soul', 'Disco / Boogie / Post-Disco'],
    siblingGroup: 'Soul, Funk & Boogie',
    superGenre: 'Rhythm \'n\' Blues (R&B)',
    secondarySuperGenre: 'Jazz',
    originYear: '1960s – Early 1980s',
    originPlace: 'Detroit, Memphis, Philadelphia, New York & Los Angeles, USA',
    bpmRange: '95–122 BPM',
    rhythmProfile: '"On the One" syncopated bass and drum pocket, rhythmic scratch guitar, brass sections, and analog synth bass (Minimoog) in Boogie/Disco.',
    sonicTraits: ['Syncopated Slap/Synth Bass', 'Tight Horn Section', 'Gospel-Rooted Vocals', 'Four-on-the-Floor Disco Groove'],
    description: 'From James Brown\'s revolutionary "On the One" funk rhythmic shift and Motown/Stax soul to George Clinton\'s P-Funk, Salsoul disco orchestras, and early-1980s synthesizer Boogie, Soul, Funk & Disco form the DNA of house, techno, hip-hop, and modern R&B.',
    parentGenres: ['Gospel', 'Blues', 'Jazz'],
    influences: ['Afrobeat', 'Latin'],
    subgenres: ['P-Funk', 'Disco', 'Boogie', 'Neo-Soul', 'Contemporary R&B'],
    adjacentGenres: ['Chicago House', 'Deep House', 'Jazz / Spiritual Jazz & Fusion', 'Hip Hop / Boom Bap', 'Afrobeat & Global Groove'],
    backlashAgainst: ['Conservative Mainstream Pop'],
    pioneerArtists: ['James Brown', 'Parliament-Funkadelic', 'Stevie Wonder', 'Marvin Gaye', 'Curtis Mayfield', 'Roy Ayers', 'Larry Levan', 'Evelyn "Champagne" King', 'D\'Angelo', 'Erykah Badu', 'Sade'],
    classicLabels: ['Motown', 'Stax', 'Salsoul Records', 'Prelude Records', 'West End Records', 'Numero Group', 'Rush Hour', 'Habibi Funk'],
    eventContexts: ['Paradise Garage (NYC)', 'The Loft (NYC)', 'Soul Train'],
    referenceTracks: [
      { title: 'Everybody Loves the Sunshine', artist: 'Roy Ayers Ubiquity', year: '1976', label: 'Polydor' },
      { title: 'Love Come Down', artist: 'Evelyn "Champagne" King', year: '1982', label: 'RCA' },
    ],
  },

  // ═══ PUNK / WAVE, INDUSTRIAL, ALTERNATIVE & ROCK SUPER-GENRES ═══
  {
    name: 'Post-Punk / Coldwave & Synth-Pop',
    aliases: ['Darkwave', 'Minimal Wave / Synth-Pop', 'New Wave'],
    siblingGroup: 'Post-Punk, Coldwave & Minimal Wave',
    superGenre: 'Punk / Wave',
    secondarySuperGenre: 'Industrial & Gothic',
    originYear: 'Late 1970s – Early 1980s (c. 1978–1984)',
    originPlace: 'Manchester, Sheffield & London, UK / Brussels, Paris & Berlin',
    bpmRange: '110–138 BPM',
    rhythmProfile: 'Motorik or drum-machine beats, melodic high-register basslines, angular chorus-drenched guitars, and icy analog synthesizers.',
    sonicTraits: ['Chorus-Drenched Bass Guitar', 'Analog Drum Machines', 'Angular Guitar', 'Detached Baritone/Cool Vocals', 'Tape Saturation'],
    description: 'Following the initial explosion of 1977 Punk, Post-Punk and Coldwave/Minimal Wave bands (Joy Division, New Order, Cabaret Voltaire, Depeche Mode, Bauhaus, Liaisons Dangereuses) absorbed Dub reggae\'s bass-heavy space, Krautrock\'s motorik repetition, and early analog synthesizers—bridging rock and underground club music.',
    parentGenres: ['Punk Rock', 'Krautrock / Kosmische', 'Dub', 'Glam Rock'],
    influences: ['Industrial', 'Disco', 'Funk'],
    subgenres: ['EBM (Electronic Body Music)', 'Goth Rock', 'Synth-Pop', 'Indie / Alternative Rock'],
    adjacentGenres: ['Industrial Techno', 'Electro', 'Krautrock / Kosmische', 'Alternative / Indie Rock', 'Shoegaze / Dream Pop'],
    backlashAgainst: ['Blues-Rock Clichés', 'Arena Rock Excess'],
    pioneerArtists: ['Joy Division', 'New Order', 'Cabaret Voltaire', 'The Cure', 'Siouxsie and the Banshees', 'Depeche Mode', 'Liaisons Dangereuses', 'DAF', 'Cocteau Twins', 'Boy Harsher'],
    classicLabels: ['Factory Records', 'Mute', '4AD', 'Rough Trade', 'Minimal Wave', 'Dark Entries', 'Cititrax'],
    eventContexts: ['The Haçienda (Manchester)', 'Batcave (London)', 'Grauzone Festival'],
    referenceTracks: [
      { title: 'Blue Monday', artist: 'New Order', year: '1983', label: 'Factory Records' },
      { title: 'Los Niños Del Parque', artist: 'Liaisons Dangereuses', year: '1981', label: 'Tiswas' },
      { title: 'Disorder', artist: 'Joy Division', year: '1979', label: 'Factory Records' },
    ],
  },
  {
    name: 'Krautrock / Kosmische',
    aliases: ['Kosmische Musik', 'Motorik Rock', 'Berlin School'],
    siblingGroup: 'Krautrock & Berlin School Electronic',
    superGenre: 'Alternative / Indie Rock',
    secondarySuperGenre: 'Downtempo / Ambient',
    originYear: 'Late 1960s – 1970s (c. 1968–1977)',
    originPlace: 'Düsseldorf, Cologne, Munich & Berlin, Germany',
    bpmRange: '110–135 BPM',
    rhythmProfile: 'Hypnotic 4/4 "Motorik" drum pulse (pioneered by Jaki Liebezeit and Klaus Dinger) paired with analog sequencers and tape collage.',
    sonicTraits: ['Motorik 4/4 Drum Pulse', 'Moog & ARP Sequencers', 'Tape Splicing', 'Hypnotic Jam Improvisation'],
    description: 'Seeking a new German musical identity after WWII free from Anglo-American pop formulas, bands like Kraftwerk, Can, Neu!, Tangerine Dream, Faust, and Cluster combined avant-garde stockhausen electronics, hypnotic "Motorik" drumming, and analog synthesizers—becoming the direct ancestor of Techno, Electro, Post-Punk, and Ambient.',
    parentGenres: ['Psychedelic Rock', 'Experimental / Avant-Garde', 'Funk'],
    influences: ['Minimalism', 'Free Jazz'],
    subgenres: ['Synth-Pop', 'Ambient', 'Detroit Techno', 'Post-Rock'],
    adjacentGenres: ['Ambient', 'Post-Punk / Coldwave & Synth-Pop', 'Detroit Techno', 'Electro'],
    backlashAgainst: ['Commercial Schlager & Blues-Rock Derivative Pop'],
    pioneerArtists: ['Kraftwerk', 'Can', 'Neu!', 'Tangerine Dream', 'Cluster', 'Harmonia', 'Klaus Schulze', 'Ashra', 'Stereolab'],
    classicLabels: ['Brain', 'Ohr', 'Sky Records', 'Kling Klang', 'Bureau B'],
    eventContexts: ['Kling Klang Studio (Düsseldorf)', 'Zodiak Free Arts Lab (Berlin)'],
    referenceTracks: [
      { title: 'Hallogallo', artist: 'Neu!', year: '1972', label: 'Brain' },
      { title: 'Vitamin C', artist: 'Can', year: '1972', label: 'United Artists' },
      { title: 'Trans-Europe Express', artist: 'Kraftwerk', year: '1977', label: 'Kling Klang' },
    ],
  },
  {
    name: 'Alternative / Indie & Shoegaze',
    aliases: ['Indie Rock', 'Shoegaze / Dream Pop', 'Post-Rock'],
    siblingGroup: 'Indie Rock, Shoegaze & Post-Rock',
    superGenre: 'Alternative / Indie Rock',
    secondarySuperGenre: 'Rock',
    originYear: '1980s – 1990s',
    originPlace: 'UK, USA & Ireland',
    bpmRange: '90–145 BPM',
    rhythmProfile: 'Driving live drums layered with textured, reverb/fuzz-washed guitars, melodic basslines, and atmospheric vocals.',
    sonicTraits: ['Reverse Reverb & Fuzz Pedals', 'Jangly / Textured Guitars', 'Ethereal Vocals', 'DIY Ethos'],
    description: 'Spanning independent guitar-driven movements from The Smiths, Sonic Youth, and Pixies to the lush pedal-board walls of sound in Shoegaze/Dream Pop (My Bloody Valentine, Slowdive, Cocteau Twins) and cinematic Post-Rock (Talk Talk, Tortoise, Mogwai).',
    parentGenres: ['Post-Punk / Coldwave & Synth-Pop', 'Psychedelic Rock', 'Garage Rock'],
    influences: ['Ambient', 'Noise', 'Folk'],
    subgenres: ['Shoegaze', 'Dream Pop', 'Post-Rock', 'Math Rock'],
    adjacentGenres: ['Post-Punk / Coldwave & Synth-Pop', 'Ambient', 'Downtempo', 'IDM / Braindance'],
    backlashAgainst: ['Hair Metal & Corporate Stadium Rock'],
    pioneerArtists: ['My Bloody Valentine', 'Slowdive', 'Cocteau Twins', 'Radiohead', 'Sonic Youth', 'Talk Talk', 'The Cure', 'Beach House', 'DIIV'],
    classicLabels: ['4AD', 'Creation Records', 'Sub Pop', 'Matador', 'Rough Trade', 'Thrill Jockey', 'kranky'],
    eventContexts: ['The Rollercoaster Tour', 'Primavera Sound (Barcelona)'],
    referenceTracks: [
      { title: 'Only Tomorrow', artist: 'My Bloody Valentine', year: '2013', label: 'mbv' },
      { title: 'Alison', artist: 'Slowdive', year: '1993', label: 'Creation' },
      { title: 'Everything In Its Right Place', artist: 'Radiohead', year: '2000', label: 'Parlophone' },
    ],
  },
  {
    name: 'Afrobeat & Global Groove',
    aliases: ['Afrobeat', 'Highlife / Afro-Funk', 'Global Disco / Habibi Funk'],
    siblingGroup: 'Afrobeat, Highlife & Global Funk',
    superGenre: 'World',
    secondarySuperGenre: 'Rhythm \'n\' Blues (R&B)',
    originYear: 'Late 1960s – 1970s',
    originPlace: 'Lagos, Nigeria / Accra, Ghana / Cairo / Addis Ababa',
    bpmRange: '100–125 BPM',
    rhythmProfile: 'Interlocking polyrhythmic percussion (Tony Allen\'s four-limb patterns), scratch tenor guitar, call-and-response horns, and hypnotic modal vamps.',
    sonicTraits: ['Polyrhythmic Drum Kit', 'Interlocking Tenor Guitars', 'Blazing Horn Section', 'Extended Hypnotic Grooves'],
    description: 'Created in Lagos, Nigeria by Fela Kuti and master drummer Tony Allen, Afrobeat fused Yoruba traditional rhythms and Ghanaian Highlife with American funk and modal jazz into epic, politically charged 15-minute polyrhythmic workouts that continue to inspire DJs and producers worldwide.',
    parentGenres: ['Highlife', 'Soul / Funk & Boogie', 'Jazz / Spiritual Jazz & Fusion'],
    influences: ['Yoruba Traditional Music', 'Psychedelic Rock'],
    subgenres: ['Afro-Disco', 'Afro House', 'Ethio-Jazz'],
    adjacentGenres: ['Soul / Funk & Boogie', 'Jazz / Spiritual Jazz & Fusion', 'Deep House', 'Roots Reggae'],
    backlashAgainst: ['Neo-Colonial Corruption'],
    pioneerArtists: ['Fela Kuti', 'Tony Allen', 'William Onyeabor', 'Ebo Taylor', 'Mulatu Astatke', 'Hailu Mergia', 'Hamid Al Shaeri'],
    classicLabels: ['Analog Africa', 'Soundway Records', 'Habibi Funk', 'Strut', 'Awesome Tapes From Africa', 'Luaka Bop', 'Honest Jon\'s'],
    eventContexts: ['Afrika Shrine (Lagos)', 'Dekmantel Selectors', 'Worldwide Festival'],
    referenceTracks: [
      { title: 'Zombie', artist: 'Fela Kuti', year: '1976', label: 'Coconut' },
      { title: 'Fantastic Man', artist: 'William Onyeabor', year: '1979', label: 'Wilfilms' },
      { title: 'Tezeta', artist: 'Mulatu Astatke', year: '1972', label: 'Worthy' },
    ],
  },
];

// Build fast lookup maps
const GENRE_BY_ID = new Map();
const ALIAS_TO_CANONICAL = new Map();

for (const node of RAW_GENRE_NODES) {
  const id = _slug(node.name);
  node.id = id;
  GENRE_BY_ID.set(id, node);
  ALIAS_TO_CANONICAL.set(_norm(node.name), node);
  for (const al of node.aliases || []) {
    ALIAS_TO_CANONICAL.set(_norm(al), node);
  }
}

// Explicit keyword & Discogs style synonym mapping -> Canonical Genre Node Name
const STYLE_SYNONYM_MAP = {
  'dub techno': 'Dub Techno',
  'dub-techno': 'Dub Techno',
  'basic channel': 'Dub Techno',
  'chord techno': 'Dub Techno',
  'detroit techno': 'Detroit Techno',
  'hi-tech soul': 'Detroit Techno',
  'hypnotic techno': 'Hypnotic Techno',
  'deep techno': 'Hypnotic Techno',
  'modular techno': 'Hypnotic Techno',
  'sci-fi techno': 'Hypnotic Techno',
  'raw techno': 'Hypnotic Techno',
  'hardgroove': 'Hypnotic Techno',
  'techno': 'Hypnotic Techno',
  'minimal techno': 'Minimal Techno',
  'minimal': 'Minimal Techno',
  'microhouse': 'Minimal Techno',
  'rominimal': 'Minimal Techno',
  'industrial techno': 'Industrial Techno',
  'hard techno': 'Industrial Techno',
  'schranz': 'Industrial Techno',
  'ebm': 'Industrial Techno',
  'electronic body music': 'Industrial Techno',
  'industrial': 'Industrial Techno',
  'rhythmic noise': 'Industrial Techno',
  'acid techno': 'Acid Techno',
  'acid': 'Acid Techno',
  'ambient techno': 'Ambient Techno',
  'intelligent techno': 'Ambient Techno',
  'chicago house': 'Chicago House',
  'classic house': 'Chicago House',
  'jackin house': 'Chicago House',
  'ghetto house': 'Chicago House',
  'house': 'Deep House',
  'deep house': 'Deep House',
  'soulful house': 'Deep House',
  'garage house': 'Deep House',
  'lo-fi house': 'Deep House',
  'jazz house': 'Deep House',
  'afro house': 'Deep House',
  'acid house': 'Acid House',
  'tech house': 'Tech House',
  'minimal house': 'Tech House',
  'electro': 'Electro',
  'electro-funk': 'Electro',
  'techno bass': 'Electro',
  'detroit electro': 'Electro',
  'uk bass': 'UK Bass / Leftfield Bass',
  'leftfield bass': 'UK Bass / Leftfield Bass',
  'post-dubstep': 'UK Bass / Leftfield Bass',
  'bass music': 'UK Bass / Leftfield Bass',
  'deconstructed club': 'UK Bass / Leftfield Bass',
  'leftfield': 'UK Bass / Leftfield Bass',
  'breakbeat': 'Breakbeat',
  'breaks': 'Breakbeat',
  'breakbeat hardcore': 'Breakbeat',
  'nu skool breaks': 'Breakbeat',
  'big beat': 'Breakbeat',
  'jungle': 'Jungle',
  'ragga jungle': 'Jungle',
  'darkcore': 'Jungle',
  'drumfunk': 'Jungle',
  'breakcore': 'Jungle',
  'drum n bass': 'Drum \'n\' Bass',
  'drum and bass': 'Drum \'n\' Bass',
  'drum & bass': 'Drum \'n\' Bass',
  'dnb': 'Drum \'n\' Bass',
  'liquid funk': 'Drum \'n\' Bass',
  'liquid dnb': 'Drum \'n\' Bass',
  'neurofunk': 'Drum \'n\' Bass',
  'techstep': 'Drum \'n\' Bass',
  'halftime': 'Drum \'n\' Bass',
  'autonomic': 'Drum \'n\' Bass',
  'uk garage': 'UK Garage / 2-Step',
  '2-step': 'UK Garage / 2-Step',
  '2 step': 'UK Garage / 2-Step',
  'speed garage': 'UK Garage / 2-Step',
  'ukg': 'UK Garage / 2-Step',
  'future garage': 'UK Garage / 2-Step',
  'uk funky': 'UK Garage / 2-Step',
  'dubstep': 'Dubstep',
  '140': 'Dubstep',
  'deep dubstep': 'Dubstep',
  'footwork': 'Footwork / Juke',
  'juke': 'Footwork / Juke',
  'idm': 'IDM / Braindance',
  'braindance': 'IDM / Braindance',
  'glitch': 'IDM / Braindance',
  'experimental': 'IDM / Braindance',
  'abstract': 'IDM / Braindance',
  'ambient': 'Ambient',
  'drone': 'Ambient',
  'dark ambient': 'Ambient',
  'modern classical': 'Ambient',
  'neoclassical': 'Ambient',
  'new age': 'Ambient',
  'kankyo ongaku': 'Ambient',
  'downtempo': 'Downtempo',
  'trip hop': 'Downtempo',
  'trip-hop': 'Downtempo',
  'chillout': 'Downtempo',
  'balearic': 'Downtempo',
  'illbient': 'Downtempo',
  'trance': 'Trance',
  'acid trance': 'Trance',
  'progressive trance': 'Trance',
  'goa trance': 'Trance',
  'psytrance': 'Trance',
  'psy-trance': 'Trance',
  'hard trance': 'Trance',
  'progressive house': 'Trance',
  'dub': 'Dub',
  'roots dub': 'Dub',
  'steppers': 'Dub',
  'reggae': 'Roots Reggae',
  'roots reggae': 'Roots Reggae',
  'dancehall': 'Roots Reggae',
  'rocksteady': 'Roots Reggae',
  'ska': 'Roots Reggae',
  'lovers rock': 'Roots Reggae',
  'hip hop': 'Hip Hop / Boom Bap',
  'hip-hop': 'Hip Hop / Boom Bap',
  'rap': 'Hip Hop / Boom Bap',
  'boom bap': 'Hip Hop / Boom Bap',
  'jazz rap': 'Hip Hop / Boom Bap',
  'instrumental hip hop': 'Hip Hop / Boom Bap',
  'lo-fi beats': 'Hip Hop / Boom Bap',
  'trap': 'Trap / Cloud Rap / Drill',
  'drill': 'Trap / Cloud Rap / Drill',
  'uk drill': 'Trap / Cloud Rap / Drill',
  'cloud rap': 'Trap / Cloud Rap / Drill',
  'phonk': 'Trap / Cloud Rap / Drill',
  'grime': 'Grime',
  'eski': 'Grime',
  'jazz': 'Jazz / Spiritual Jazz & Fusion',
  'spiritual jazz': 'Jazz / Spiritual Jazz & Fusion',
  'modal jazz': 'Jazz / Spiritual Jazz & Fusion',
  'jazz-funk': 'Jazz / Spiritual Jazz & Fusion',
  'jazz fusion': 'Jazz / Spiritual Jazz & Fusion',
  'fusion': 'Jazz / Spiritual Jazz & Fusion',
  'free jazz': 'Jazz / Spiritual Jazz & Fusion',
  'bebop': 'Jazz / Spiritual Jazz & Fusion',
  'contemporary jazz': 'Jazz / Spiritual Jazz & Fusion',
  'broken beat': 'Jazz / Spiritual Jazz & Fusion',
  'nu jazz': 'Jazz / Spiritual Jazz & Fusion',
  'soul': 'Soul / Funk & Boogie',
  'funk': 'Soul / Funk & Boogie',
  'funk / soul': 'Soul / Funk & Boogie',
  'boogie': 'Soul / Funk & Boogie',
  'disco': 'Soul / Funk & Boogie',
  'post-disco': 'Soul / Funk & Boogie',
  'italo-disco': 'Soul / Funk & Boogie',
  'italo disco': 'Soul / Funk & Boogie',
  'r&b': 'Soul / Funk & Boogie',
  'rnb': 'Soul / Funk & Boogie',
  'neo-soul': 'Soul / Funk & Boogie',
  'neo soul': 'Soul / Funk & Boogie',
  'gospel': 'Soul / Funk & Boogie',
  'post-punk': 'Post-Punk / Coldwave & Synth-Pop',
  'coldwave': 'Post-Punk / Coldwave & Synth-Pop',
  'minimal wave': 'Post-Punk / Coldwave & Synth-Pop',
  'darkwave': 'Post-Punk / Coldwave & Synth-Pop',
  'synth-pop': 'Post-Punk / Coldwave & Synth-Pop',
  'synthpop': 'Post-Punk / Coldwave & Synth-Pop',
  'new wave': 'Post-Punk / Coldwave & Synth-Pop',
  'goth rock': 'Post-Punk / Coldwave & Synth-Pop',
  'punk': 'Post-Punk / Coldwave & Synth-Pop',
  'krautrock': 'Krautrock / Kosmische',
  'kosmische': 'Krautrock / Kosmische',
  'berlin school': 'Krautrock / Kosmische',
  'indie rock': 'Alternative / Indie & Shoegaze',
  'alternative rock': 'Alternative / Indie & Shoegaze',
  'shoegaze': 'Alternative / Indie & Shoegaze',
  'dream pop': 'Alternative / Indie & Shoegaze',
  'post-rock': 'Alternative / Indie & Shoegaze',
  'psychedelic rock': 'Alternative / Indie & Shoegaze',
  'rock': 'Alternative / Indie & Shoegaze',
  'afrobeat': 'Afrobeat & Global Groove',
  'highlife': 'Afrobeat & Global Groove',
  'ethio-jazz': 'Afrobeat & Global Groove',
  'latin': 'Afrobeat & Global Groove',
  'bossa nova': 'Afrobeat & Global Groove',
  'mpb': 'Afrobeat & Global Groove',
  'world': 'Afrobeat & Global Groove',
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ARTIST & LABEL KNOWLEDGE GRAPH PRIORS
// ─────────────────────────────────────────────────────────────────────────────

const ARTIST_GENRE_GRAPH = {
  // Dub Techno & Hypnotic / Deep Techno
  'basic channel': ['Dub Techno', 'Minimal Techno'],
  'maurizio': ['Dub Techno', 'Detroit Techno'],
  'rhythm & sound': ['Dub Techno', 'Dub'],
  'rhythm and sound': ['Dub Techno', 'Dub'],
  'deepchord': ['Dub Techno', 'Ambient Techno'],
  'rod modell': ['Dub Techno', 'Ambient'],
  'echospace': ['Dub Techno', 'Ambient Techno'],
  'porter ricks': ['Dub Techno', 'Industrial Techno'],
  'fluxion': ['Dub Techno', 'Ambient Techno'],
  'monolake': ['Dub Techno', 'IDM / Braindance'],
  'vladislav delay': ['Dub Techno', 'Ambient'],
  'luomo': ['Minimal Techno', 'Deep House'],
  'convextion': ['Dub Techno', 'Detroit Techno', 'Electro'],
  'erp': ['Electro', 'Detroit Techno'],
  'e.r.p.': ['Electro', 'Detroit Techno'],
  'gerard hanson': ['Dub Techno', 'Electro'],
  'prince of denmark': ['Dub Techno', 'Hypnotic Techno'],
  'traumprinz': ['Deep House', 'Dub Techno', 'Ambient Techno'],
  'dj metatron': ['Ambient Techno', 'Deep House', 'Trance'],
  'prime minister of doom': ['Dub Techno', 'Deep House'],
  'forest drive west': ['Hypnotic Techno', 'UK Bass / Leftfield Bass', 'Jungle'],
  'rrose': ['Hypnotic Techno', 'Industrial Techno'],
  'donato dozzy': ['Hypnotic Techno', 'Ambient Techno', 'Dub Techno'],
  'voices from the lake': ['Hypnotic Techno', 'Dub Techno', 'Ambient Techno'],
  'neel': ['Hypnotic Techno', 'Ambient'],
  'luigi tozzi': ['Hypnotic Techno', 'Dub Techno', 'Ambient Techno'],
  'claudio prc': ['Hypnotic Techno', 'Dub Techno'],
  'dino sabatini': ['Hypnotic Techno'],
  'dvs1': ['Hypnotic Techno', 'Detroit Techno'],
  'oscar mulero': ['Hypnotic Techno', 'Industrial Techno'],
  'surgeon': ['Industrial Techno', 'Hypnotic Techno'],
  'regis': ['Industrial Techno', 'Post-Punk / Coldwave & Synth-Pop'],
  'function': ['Hypnotic Techno', 'Detroit Techno'],
  'silent servant': ['Industrial Techno', 'Post-Punk / Coldwave & Synth-Pop'],
  'sandwell district': ['Hypnotic Techno', 'Industrial Techno'],
  'blawan': ['Industrial Techno', 'Hypnotic Techno', 'UK Bass / Leftfield Bass'],
  'pariah': ['UK Bass / Leftfield Bass', 'Industrial Techno'],
  'karenn': ['Industrial Techno', 'Hypnotic Techno'],
  'rodaidh mcdonald': ['Dub Techno', 'Ambient'],
  'abdulla rashim': ['Hypnotic Techno', 'Ambient'],
  'anthony linell': ['Hypnotic Techno', 'Industrial Techno'],
  'varg': ['Hypnotic Techno', 'Ambient'],
  'aconym': ['Hypnotic Techno', 'Ambient Techno'],
  'acronym': ['Hypnotic Techno', 'Ambient Techno'],
  'wata igarashi': ['Hypnotic Techno', 'Trance'],
  'dj nobu': ['Hypnotic Techno', 'Industrial Techno'],
  'takaaki itoh': ['Hypnotic Techno'],
  'marcel dettmann': ['Hypnotic Techno', 'Detroit Techno'],
  'ben klock': ['Hypnotic Techno', 'Detroit Techno'],
  'len faki': ['Hypnotic Techno'],
  'planetary assault systems': ['Hypnotic Techno', 'Detroit Techno'],
  'luke slater': ['Hypnotic Techno', 'Detroit Techno'],
  'rene wise': ['Hypnotic Techno', 'Minimal Techno'],
  'marron': ['Hypnotic Techno'],
  'sasha': ['Trance', 'Tech House'],
  'skee mask': ['Ambient Techno', 'UK Bass / Leftfield Bass', 'Breakbeat', 'IDM / Braindance'],
  'stenny': ['UK Bass / Leftfield Bass', 'Breakbeat', 'Ambient Techno'],
  'zenker brothers': ['Hypnotic Techno', 'Breakbeat', 'UK Bass / Leftfield Bass'],
  'andrea': ['IDM / Braindance', 'Jungle', 'Ambient Techno'],
  'barker': ['Ambient Techno', 'Hypnotic Techno', 'IDM / Braindance'],
  'objekt': ['UK Bass / Leftfield Bass', 'IDM / Braindance', 'Electro'],
  'call super': ['UK Bass / Leftfield Bass', 'Minimal Techno', 'Deep House'],
  'pearson sound': ['UK Bass / Leftfield Bass', 'UK Garage / 2-Step', 'Hypnotic Techno'],
  'ben ufo': ['UK Bass / Leftfield Bass', 'Hypnotic Techno', 'Jungle'],
  'pangaea': ['UK Bass / Leftfield Bass', 'Tech House', 'Dubstep'],
  'peverelist': ['UK Bass / Leftfield Bass', 'Dubstep', 'Hypnotic Techno'],
  'batu': ['UK Bass / Leftfield Bass', 'Hypnotic Techno'],
  'hodge': ['UK Bass / Leftfield Bass', 'Hypnotic Techno'],
  'joy orbison': ['UK Bass / Leftfield Bass', 'UK Garage / 2-Step', 'Deep House'],
  'overmono': ['Breakbeat', 'UK Garage / 2-Step', 'UK Bass / Leftfield Bass'],
  'bicep': ['Breakbeat', 'Deep House', 'Ambient Techno'],
  'four tet': ['IDM / Braindance', 'Deep House', 'UK Garage / 2-Step'],
  'floating points': ['Jazz / Spiritual Jazz & Fusion', 'Deep House', 'Ambient'],
  // Detroit & Electro
  'jeff mills': ['Detroit Techno', 'Hypnotic Techno'],
  'robert hood': ['Minimal Techno', 'Detroit Techno'],
  'floorplan': ['Chicago House', 'Detroit Techno'],
  'derrick may': ['Detroit Techno'],
  'rhythim is rhythim': ['Detroit Techno'],
  'juan atkins': ['Detroit Techno', 'Electro'],
  'model 500': ['Detroit Techno', 'Electro'],
  'cybotron': ['Electro', 'Detroit Techno'],
  'kevin saunderson': ['Detroit Techno', 'Chicago House'],
  'inner city': ['Detroit Techno', 'Chicago House'],
  'carl craig': ['Detroit Techno', 'Ambient Techno'],
  'paperclip people': ['Detroit Techno', 'Deep House'],
  '69': ['Detroit Techno', 'Minimal Techno'],
  'underground resistance': ['Detroit Techno', 'Electro'],
  'drexciya': ['Electro', 'Detroit Techno'],
  'dopplereffekt': ['Electro', 'Post-Punk / Coldwave & Synth-Pop'],
  'arbeiter': ['Electro'],
  'aux 88': ['Electro', 'Detroit Techno'],
  'dj stingray': ['Electro', 'Detroit Techno'],
  'dj stingray 313': ['Electro', 'Detroit Techno'],
  'helena hauff': ['Electro', 'Acid Techno', 'Industrial Techno'],
  'legowelt': ['Electro', 'Deep House', 'Acid House'],
  'i-f': ['Electro', 'Soul / Funk & Boogie'],
  'moodymann': ['Deep House', 'Detroit Techno', 'Soul / Funk & Boogie'],
  'theo parrish': ['Deep House', 'Jazz / Spiritual Jazz & Fusion', 'Soul / Funk & Boogie'],
  'omar-s': ['Deep House', 'Detroit Techno'],
  'omar s': ['Deep House', 'Detroit Techno'],
  'larry heard': ['Deep House', 'Chicago House'],
  'mr. fingers': ['Deep House', 'Chicago House'],
  'fingers inc.': ['Deep House', 'Chicago House'],
  'frankie knuckles': ['Chicago House', 'Soul / Funk & Boogie'],
  'ron trent': ['Deep House', 'Chicago House'],
  'kerri chandler': ['Deep House', 'Chicago House'],
  'masters at work': ['Deep House', 'Soul / Funk & Boogie'],
  'ricardo villalobos': ['Minimal Techno', 'Tech House'],
  'richie hawtin': ['Minimal Techno', 'Acid Techno'],
  'plastikman': ['Minimal Techno', 'Acid Techno'],
  'daniel bell': ['Minimal Techno', 'Chicago House'],
  'dbx': ['Minimal Techno', 'Detroit Techno'],
  'zip': ['Minimal Techno', 'Deep House'],
  // IDM, Ambient, Jungle, Dubstep
  'aphex twin': ['IDM / Braindance', 'Ambient Techno', 'Jungle'],
  'afx': ['Acid Techno', 'IDM / Braindance'],
  'polygon window': ['Ambient Techno', 'IDM / Braindance'],
  'autechre': ['IDM / Braindance', 'Electro'],
  'boards of canada': ['IDM / Braindance', 'Downtempo', 'Ambient'],
  'squarepusher': ['IDM / Braindance', 'Jungle', 'Jazz / Spiritual Jazz & Fusion'],
  'b12': ['Ambient Techno', 'Detroit Techno'],
  'the black dog': ['Ambient Techno', 'IDM / Braindance'],
  'plaid': ['IDM / Braindance', 'Ambient Techno'],
  'global communication': ['Ambient Techno', 'Ambient'],
  'biosphere': ['Ambient', 'Ambient Techno'],
  'brian eno': ['Ambient', 'Krautrock / Kosmische'],
  'hiroshi yoshimura': ['Ambient'],
  'william basinski': ['Ambient'],
  'tim hecker': ['Ambient', 'IDM / Braindance'],
  'grouper': ['Ambient', 'Alternative / Indie & Shoegaze'],
  'huerco s.': ['Ambient', 'Dub Techno', 'Deep House'],
  'pendant': ['Ambient', 'Dub Techno'],
  'burial': ['Dubstep', 'UK Garage / 2-Step', 'Ambient'],
  'mala': ['Dubstep', 'Dub'],
  'digital mystikz': ['Dubstep', 'Dub'],
  'skream': ['Dubstep', 'UK Garage / 2-Step'],
  'loefah': ['Dubstep', 'UK Bass / Leftfield Bass'],
  'kode9': ['Dubstep', 'Footwork / Juke'],
  'shackleton': ['Dubstep', 'Hypnotic Techno'],
  'goldie': ['Jungle', 'Drum \'n\' Bass'],
  'ltj bukem': ['Jungle', 'Drum \'n\' Bass', 'Ambient Techno'],
  'photek': ['Drum \'n\' Bass', 'Jungle', 'Deep House'],
  'source direct': ['Jungle', 'Drum \'n\' Bass'],
  'calibre': ['Drum \'n\' Bass', 'Dub'],
  'dbridge': ['Drum \'n\' Bass', 'UK Bass / Leftfield Bass'],
  'sully': ['Jungle', 'Footwork / Juke'],
  'tim reaper': ['Jungle'],
  'dj rashad': ['Footwork / Juke', 'Jungle'],
  'rp boo': ['Footwork / Juke', 'Chicago House'],
  'jlin': ['Footwork / Juke', 'IDM / Braindance'],
  'massive attack': ['Downtempo', 'Dub'],
  'portishead': ['Downtempo', 'Alternative / Indie & Shoegaze'],
  'dj shadow': ['Downtempo', 'Hip Hop / Boom Bap'],
  'king tubby': ['Dub', 'Roots Reggae'],
  'lee scratch perry': ['Dub', 'Roots Reggae'],
  'scientist': ['Dub', 'Roots Reggae'],
  'augustus pablo': ['Dub', 'Roots Reggae'],
  'j dilla': ['Hip Hop / Boom Bap', 'Soul / Funk & Boogie'],
  'madlib': ['Hip Hop / Boom Bap', 'Jazz / Spiritual Jazz & Fusion'],
  'mf doom': ['Hip Hop / Boom Bap'],
  'madvillain': ['Hip Hop / Boom Bap'],
  'a tribe called quest': ['Hip Hop / Boom Bap', 'Jazz / Spiritual Jazz & Fusion'],
  'nas': ['Hip Hop / Boom Bap'],
  'kendrick lamar': ['Hip Hop / Boom Bap', 'Jazz / Spiritual Jazz & Fusion'],
  'miles davis': ['Jazz / Spiritual Jazz & Fusion'],
  'john coltrane': ['Jazz / Spiritual Jazz & Fusion'],
  'alice coltrane': ['Jazz / Spiritual Jazz & Fusion', 'Ambient'],
  'pharoah sanders': ['Jazz / Spiritual Jazz & Fusion'],
  'herbie hancock': ['Jazz / Spiritual Jazz & Fusion', 'Soul / Funk & Boogie'],
  'nala sinephro': ['Jazz / Spiritual Jazz & Fusion', 'Ambient'],
  'kraftwerk': ['Krautrock / Kosmische', 'Electro', 'Post-Punk / Coldwave & Synth-Pop'],
  'can': ['Krautrock / Kosmische'],
  'neu!': ['Krautrock / Kosmische'],
  'joy division': ['Post-Punk / Coldwave & Synth-Pop'],
  'new order': ['Post-Punk / Coldwave & Synth-Pop', 'Acid House'],
  'my bloody valentine': ['Alternative / Indie & Shoegaze'],
  'slowdive': ['Alternative / Indie & Shoegaze', 'Ambient'],
  'radiohead': ['Alternative / Indie & Shoegaze', 'IDM / Braindance'],
  'fela kuti': ['Afrobeat & Global Groove', 'Soul / Funk & Boogie'],
};

const LABEL_GENRE_GRAPH = {
  'basic channel': ['Dub Techno', 'Minimal Techno'],
  'chain reaction': ['Dub Techno', 'Ambient Techno'],
  'maurizio': ['Dub Techno', 'Detroit Techno'],
  'burial mix': ['Dub Techno', 'Dub'],
  'echospace': ['Dub Techno', 'Ambient'],
  'echocord': ['Dub Techno', 'Hypnotic Techno'],
  'silent season': ['Dub Techno', 'Ambient', 'Hypnotic Techno'],
  'delsin': ['Hypnotic Techno', 'Detroit Techno', 'Dub Techno', 'Ambient Techno'],
  'mantis': ['Hypnotic Techno', 'UK Bass / Leftfield Bass', 'Dub Techno'],
  'delsin — mantis': ['Hypnotic Techno', 'UK Bass / Leftfield Bass', 'Dub Techno'],
  'ilian tape': ['UK Bass / Leftfield Bass', 'Breakbeat', 'Hypnotic Techno', 'Ambient Techno'],
  'livity sound': ['UK Bass / Leftfield Bass', 'Hypnotic Techno'],
  'hessle audio': ['UK Bass / Leftfield Bass', 'Deep House', 'Hypnotic Techno'],
  'timedance': ['UK Bass / Leftfield Bass', 'Hypnotic Techno'],
  'whities': ['UK Bass / Leftfield Bass', 'IDM / Braindance'],
  'ad 93': ['UK Bass / Leftfield Bass', 'Ambient'],
  'ostgut ton': ['Hypnotic Techno', 'Deep House', 'Industrial Techno'],
  'klockworks': ['Hypnotic Techno', 'Detroit Techno'],
  'semantica': ['Hypnotic Techno', 'Ambient Techno'],
  'northern electronics': ['Hypnotic Techno', 'Ambient'],
  'polegroup': ['Hypnotic Techno'],
  'warm up': ['Hypnotic Techno'],
  'sandwell district': ['Hypnotic Techno', 'Industrial Techno'],
  'downwards': ['Industrial Techno', 'Post-Punk / Coldwave & Synth-Pop'],
  'blueprint': ['Industrial Techno', 'Hypnotic Techno'],
  'token': ['Hypnotic Techno', 'Industrial Techno'],
  'mord': ['Industrial Techno', 'Hypnotic Techno'],
  'perc trax': ['Industrial Techno'],
  'stroboscopic artefacts': ['Hypnotic Techno', 'Ambient'],
  'prologue': ['Hypnotic Techno', 'Dub Techno'],
  'giegling': ['Dub Techno', 'Deep House', 'Minimal Techno'],
  'perlon': ['Minimal Techno', 'Deep House'],
  'kompakt': ['Minimal Techno', 'Ambient Techno'],
  'm-plant': ['Minimal Techno', 'Detroit Techno'],
  'plus 8': ['Minimal Techno', 'Acid Techno', 'Detroit Techno'],
  'minus': ['Minimal Techno'],
  'tresor': ['Detroit Techno', 'Industrial Techno', 'Electro'],
  'underground resistance': ['Detroit Techno', 'Electro'],
  'transmat': ['Detroit Techno'],
  'metroplex': ['Detroit Techno', 'Electro'],
  'axis': ['Detroit Techno', 'Hypnotic Techno'],
  'planet e': ['Detroit Techno', 'Ambient Techno'],
  'clone': ['Electro', 'Detroit Techno', 'Acid House'],
  'bunker': ['Electro', 'Acid Techno'],
  'viewlexx': ['Electro'],
  'central processing unit': ['Electro', 'IDM / Braindance'],
  'warp': ['IDM / Braindance', 'Ambient Techno', 'Electro'],
  'rephlex': ['IDM / Braindance', 'Acid Techno', 'Electro'],
  'planet mu': ['Footwork / Juke', 'IDM / Braindance', 'Jungle'],
  'skam': ['IDM / Braindance', 'Electro'],
  'raster-noton': ['IDM / Braindance', 'Ambient'],
  'r&s': ['Ambient Techno', 'Acid House', 'Jungle'],
  'apollo': ['Ambient Techno', 'Ambient'],
  'trax': ['Chicago House', 'Acid House'],
  'dj international': ['Chicago House'],
  'sound signature': ['Deep House', 'Jazz / Spiritual Jazz & Fusion'],
  'mahogani music': ['Deep House', 'Soul / Funk & Boogie'],
  'fxhe': ['Deep House', 'Detroit Techno'],
  'rush hour': ['Deep House', 'Soul / Funk & Boogie', 'Detroit Techno'],
  'dekmantel': ['Deep House', 'Electro', 'Detroit Techno'],
  'metalheadz': ['Jungle', 'Drum \'n\' Bass'],
  'moving shadow': ['Jungle', 'Drum \'n\' Bass'],
  'good looking': ['Jungle', 'Drum \'n\' Bass', 'Ambient Techno'],
  'reinforced': ['Jungle', 'Breakbeat'],
  'exit records': ['Drum \'n\' Bass', 'UK Bass / Leftfield Bass'],
  'samurai music': ['Drum \'n\' Bass', 'Hypnotic Techno'],
  'signature': ['Drum \'n\' Bass'],
  'hospital': ['Drum \'n\' Bass'],
  'hyperdub': ['Dubstep', 'Footwork / Juke', 'UK Garage / 2-Step'],
  'dmz': ['Dubstep', 'Dub'],
  'deep medi': ['Dubstep'],
  'tempa': ['Dubstep', 'UK Garage / 2-Step'],
  'tectonic': ['Dubstep', 'UK Bass / Leftfield Bass'],
  'ninja tune': ['Downtempo', 'Breakbeat', 'UK Bass / Leftfield Bass'],
  'xl recordings': ['Breakbeat', 'UK Garage / 2-Step', 'Grime'],
  'studio one': ['Roots Reggae', 'Dub'],
  'on-u sound': ['Dub', 'Post-Punk / Coldwave & Synth-Pop'],
  'stones throw': ['Hip Hop / Boom Bap', 'Soul / Funk & Boogie'],
  'blue note': ['Jazz / Spiritual Jazz & Fusion'],
  'impulse!': ['Jazz / Spiritual Jazz & Fusion'],
  'ecm': ['Jazz / Spiritual Jazz & Fusion', 'Ambient'],
  '4ad': ['Alternative / Indie & Shoegaze', 'Post-Punk / Coldwave & Synth-Pop'],
  'factory': ['Post-Punk / Coldwave & Synth-Pop', 'Acid House'],
  'analog africa': ['Afrobeat & Global Groove', 'Soul / Funk & Boogie'],
  'soundway': ['Afrobeat & Global Groove', 'Soul / Funk & Boogie'],
  'habibi funk': ['Afrobeat & Global Groove', 'Soul / Funk & Boogie'],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ONTOLOGY RESOLVER & DYNAMIC SYNTHESIZER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given any raw genre/style string (e.g. "Dub Techno", "Electronic, Techno, Dub Techno", "Jungle", "Minimal"),
 * returns the rich canonical Musicmap Genre Node. If the string is a compound or niche subgenre not in
 * RAW_GENRE_NODES, dynamically synthesizes a full node so every genre in the app has complete information.
 */
export function resolveGenreNode(rawGenreInput) {
  const raw = String(rawGenreInput || '').trim();
  if (!raw) return GENRE_BY_ID.get('hypnotic-techno') || RAW_GENRE_NODES[0];

  // If comma-separated list, pick the most specific style token first (avoid generic "Electronic")
  const tokens = raw
    .split(/[,;|•]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const genericUmbrellas = new Set(['electronic', 'music', 'dance', 'club', 'other', 'pop/rock', 'non-music']);
  const orderedTokens = [
    ...tokens.filter(t => !genericUmbrellas.has(_norm(t))),
    ...tokens.filter(t => genericUmbrellas.has(_norm(t))),
  ];

  for (const tok of orderedTokens) {
    const n = _norm(tok);
    if (ALIAS_TO_CANONICAL.has(n)) {
      return ALIAS_TO_CANONICAL.get(n);
    }
    if (STYLE_SYNONYM_MAP[n]) {
      const targetName = STYLE_SYNONYM_MAP[n];
      const found = ALIAS_TO_CANONICAL.get(_norm(targetName));
      if (found) return found;
    }
    // Partial match against STYLE_SYNONYM_MAP keys (longest key first)
    const matchingKey = Object.keys(STYLE_SYNONYM_MAP)
      .sort((a, b) => b.length - a.length)
      .find(k => k.length >= 4 && n.includes(k));
    if (matchingKey) {
      const found = ALIAS_TO_CANONICAL.get(_norm(STYLE_SYNONYM_MAP[matchingKey]));
      if (found) return found;
    }
  }

  // Dynamic synthesis for specialized / niche micro-genres
  const displayTitle = orderedTokens[0] || raw;
  const baseNode = GENRE_BY_ID.get('hypnotic-techno') || RAW_GENRE_NODES[0];
  return {
    ...baseNode,
    id: _slug(displayTitle),
    name: displayTitle,
    aliases: tokens.length > 1 ? tokens.slice(1, 4) : ['Underground Electronic', 'Leftfield'],
    description: `${displayTitle} is a specialized stylistic current within contemporary music taxonomy, bridging underground electronic production, club culture, and cross-genre experimentation. Like many fluid styles in the Musicmap ontology, ${displayTitle} draws on foundational rhythmic and timbral lineages while evolving through dedicated independent labels, DJ sets, and scene communities.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. UNIVERSAL MULTI-SIGNAL TRACK GENRE CLASSIFIER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines the primary genre, secondary genres (0–3), super-genre, origin, and provenance
 * for EVERY single title in the app, regardless of provider (Spotify, SoundCloud, Apple Music,
 * Tidal, Bandcamp, YouTube, Discogs, or Native).
 */
export function classifyTrackGenre(track = {}, extraMeta = {}) {
  const candidates = []; // { genreName, weight, source }
  const addCandidate = (rawStr, weight, source) => {
    if (!rawStr) return;
    const parts = Array.isArray(rawStr)
      ? rawStr
      : String(rawStr).split(/[,;|•]+/);
    for (const part of parts) {
      const clean = String(part || '').trim();
      if (!clean) continue;
      const n = _norm(clean);
      if (!n || ['electronic', 'music', 'track', 'album', 'event', 'unknown'].includes(n)) continue;
      const node = resolveGenreNode(clean);
      if (node) {
        candidates.push({ node, weight, source });
      }
    }
  };

  const title = String(track.title || track.name || extraMeta.title || '').trim();
  const artist = String(track.artistName || track.artist || extraMeta.artist || '').trim();
  const album = String(track.releaseTitle || track.albumTitle || track.album || extraMeta.album || '').trim();
  const label = String(track.label || track.labelName || track.releaseLabel || extraMeta.label || '').trim();
  const provider = String(track.provider || extraMeta.provider || '').toLowerCase();

  // 1. Explicit Discogs styles & MusicBrainz tags (highest specificity)
  if (extraMeta.styles) addCandidate(extraMeta.styles, 1.0, 'Discogs Style');
  if (extraMeta.genre) addCandidate(extraMeta.genre, 0.9, 'Discogs / MusicBrainz');
  if (extraMeta.mbTags) addCandidate(extraMeta.mbTags, 0.85, 'MusicBrainz Tag');

  // 2. Track's own genre / tags from provider (Bandcamp, SoundCloud, Spotify, Apple Music, Discogs)
  if (track.styles) addCandidate(track.styles, 0.95, 'Release Style');
  if (track.genre && track.genre !== 'Event') addCandidate(track.genre, 0.88, 'Track Metadata');
  if (track.tags) addCandidate(track.tags, 0.82, 'Provider Tags');

  // 3. Artist & Remixer Knowledge Graph Lookup
  const artistNorm = _norm(artist);
  for (const [aKey, genres] of Object.entries(ARTIST_GENRE_GRAPH)) {
    if (artistNorm === aKey || (aKey.length >= 4 && (artistNorm.includes(aKey) || _norm(title).includes(aKey)))) {
      genres.forEach((g, idx) => addCandidate(g, idx === 0 ? 0.94 : 0.72, `Artist Graph (${artist || aKey})`));
    }
  }

  // Check remixers in title: e.g. "Track Name (Forest Drive West Remix)"
  const remixMatch = title.match(/\(([^)]+?)\s+(?:remix|dub|rework|mix|edit|vip)\)/i);
  if (remixMatch && remixMatch[1]) {
    const remixerNorm = _norm(remixMatch[1]);
    for (const [aKey, genres] of Object.entries(ARTIST_GENRE_GRAPH)) {
      if (remixerNorm.includes(aKey)) {
        genres.forEach((g, idx) => addCandidate(g, idx === 0 ? 0.90 : 0.68, `Remixer Lineage (${remixMatch[1].trim()})`));
      }
    }
  }

  // 4. Label Knowledge Graph Lookup
  const labelNorm = _norm(label.replace(/\[.*?\]/g, '').replace(/\(sub-label.*?\)/i, ''));
  const albumNorm = _norm(album);
  for (const [lKey, genres] of Object.entries(LABEL_GENRE_GRAPH)) {
    if (
      (labelNorm && (labelNorm === lKey || labelNorm.includes(lKey))) ||
      (albumNorm && lKey.length >= 5 && albumNorm.includes(lKey)) ||
      (_norm(title).includes(lKey) && lKey.length >= 5)
    ) {
      genres.forEach((g, idx) => addCandidate(g, idx === 0 ? 0.91 : 0.70, `Label Graph (${label || lKey})`));
    }
  }

  // 5. Title / Album / Description Keyword & Mix-Type Analysis
  const textBlob = `${title} ${album} ${extraMeta.description || ''} ${extraMeta.artistBio || ''}`.toLowerCase();
  const cuePatterns = [
    { re: /\b(dub techno|basic channel|chord dub)\b/i, genre: 'Dub Techno', w: 0.85 },
    { re: /\b(mantis|hypnotic techno|deep techno|modular techno|scifi techno)\b/i, genre: 'Hypnotic Techno', w: 0.82 },
    { re: /\b(detroit techno|motor city)\b/i, genre: 'Detroit Techno', w: 0.84 },
    { re: /\b(minimal techno|microhouse|rominimal)\b/i, genre: 'Minimal Techno', w: 0.82 },
    { re: /\b(industrial techno|ebm|schranz)\b/i, genre: 'Industrial Techno', w: 0.82 },
    { re: /\b(acid techno|303|tb-303|acperience)\b/i, genre: 'Acid Techno', w: 0.80 },
    { re: /\b(ambient techno|intelligent techno)\b/i, genre: 'Ambient Techno', w: 0.82 },
    { re: /\b(deep house|rhodes|larry heard)\b/i, genre: 'Deep House', w: 0.80 },
    { re: /\b(chicago house|trax records|jackin)\b/i, genre: 'Chicago House', w: 0.80 },
    { re: /\b(acid house)\b/i, genre: 'Acid House', w: 0.82 },
    { re: /\b(tech house)\b/i, genre: 'Tech House', w: 0.80 },
    { re: /\b(drexciya|electro-funk|808 electro|electro mix)\b/i, genre: 'Electro', w: 0.80 },
    { re: /\b(jungle|amen break|ragga|160 bpm|drumfunk)\b/i, genre: 'Jungle', w: 0.84 },
    { re: /\b(drum\s*(?:&|and|'n'|n)\s*bass|dnb|neurofunk|techstep|liquid funk|170 bpm)\b/i, genre: 'Drum \'n\' Bass', w: 0.84 },
    { re: /\b(uk garage|2-step|2 step|speed garage|ukg)\b/i, genre: 'UK Garage / 2-Step', w: 0.84 },
    { re: /\b(dubstep|140 bpm|dmz|deep medi)\b/i, genre: 'Dubstep', w: 0.84 },
    { re: /\b(footwork|juke|teklife)\b/i, genre: 'Footwork / Juke', w: 0.85 },
    { re: /\b(uk bass|leftfield bass|hessle|livity|timedance)\b/i, genre: 'UK Bass / Leftfield Bass', w: 0.83 },
    { re: /\b(breakbeat|breaks)\b/i, genre: 'Breakbeat', w: 0.78 },
    { re: /\b(idm|braindance|glitch)\b/i, genre: 'IDM / Braindance', w: 0.82 },
    { re: /\b(ambient|drone|field recording|soundscape)\b/i, genre: 'Ambient', w: 0.76 },
    { re: /\b(trip hop|trip-hop|downtempo|balearic)\b/i, genre: 'Downtempo', w: 0.80 },
    { re: /\b(trance|goa|psytrance)\b/i, genre: 'Trance', w: 0.80 },
    { re: /\b(king tubby|roots dub|dub version|dubplate|stepper dub)\b/i, genre: 'Dub', w: 0.82 },
    { re: /\b(reggae|rocksteady|dancehall|roots)\b/i, genre: 'Roots Reggae', w: 0.78 },
    { re: /\b(boom bap|hip hop|hip-hop|mpc|freestyle)\b/i, genre: 'Hip Hop / Boom Bap', w: 0.78 },
    { re: /\b(trap|drill|808 glide)\b/i, genre: 'Trap / Cloud Rap / Drill', w: 0.78 },
    { re: /\b(grime|eski|rinse fm)\b/i, genre: 'Grime', w: 0.80 },
    { re: /\b(spiritual jazz|modal jazz|jazz-funk|quartet|quintet|trio|saxophone)\b/i, genre: 'Jazz / Spiritual Jazz & Fusion', w: 0.78 },
    { re: /\b(boogie|disco|p-funk|motown|soul)\b/i, genre: 'Soul / Funk & Boogie', w: 0.76 },
    { re: /\b(post-punk|coldwave|minimal wave|darkwave|synth-pop)\b/i, genre: 'Post-Punk / Coldwave & Synth-Pop', w: 0.82 },
    { re: /\b(krautrock|kosmische|motorik)\b/i, genre: 'Krautrock / Kosmische', w: 0.84 },
    { re: /\b(shoegaze|dream pop|indie rock|post-rock)\b/i, genre: 'Alternative / Indie & Shoegaze', w: 0.80 },
    { re: /\b(afrobeat|highlife|ethio-jazz)\b/i, genre: 'Afrobeat & Global Groove', w: 0.84 },
    { re: /\b(dub mix|dub)\b/i, genre: 'Dub Techno', w: 0.62 },
    { re: /\b(techno)\b/i, genre: 'Hypnotic Techno', w: 0.68 },
    { re: /\b(house)\b/i, genre: 'Deep House', w: 0.65 },
    { re: /\b(electro)\b/i, genre: 'Electro', w: 0.68 },
  ];

  for (const cue of cuePatterns) {
    if (cue.re.test(textBlob)) {
      addCandidate(cue.genre, cue.w, 'Title / Context Analysis');
    }
  }

  // 6. Aggregate scores per canonical genre node
  const scoreMap = new Map(); // id -> { node, score, sources: Set }
  for (const c of candidates) {
    const existing = scoreMap.get(c.node.id);
    if (!existing) {
      scoreMap.set(c.node.id, {
        node: c.node,
        score: c.weight,
        sources: new Set([c.source]),
      });
    } else {
      // Diminishing boost for multiple agreeing signals
      existing.score = Math.min(0.99, existing.score + c.weight * 0.28);
      existing.sources.add(c.source);
    }
  }

  const ranked = [...scoreMap.values()].sort((a, b) => b.score - a.score);

  // 7. Guaranteed Fallback so EVERY title in the app has a rich canonical genre
  if (ranked.length === 0) {
    // Intelligent provider/context default while waiting for Discogs/MusicBrainz async resolution
    let fallbackGenre = 'Hypnotic Techno';
    if (provider === 'bandcamp') fallbackGenre = 'Hypnotic Techno';
    else if (provider === 'soundcloud') fallbackGenre = 'UK Bass / Leftfield Bass';
    else if (provider === 'spotify' || provider === 'applemusic' || provider === 'tidal') fallbackGenre = 'Deep House';
    const fbNode = resolveGenreNode(fallbackGenre);
    return {
      primaryGenre: fbNode.name,
      secondaryGenres: fbNode.adjacentGenres.slice(0, 2),
      superGenre: fbNode.superGenre,
      secondarySuperGenre: fbNode.secondarySuperGenre || '',
      originYear: fbNode.originYear,
      originPlace: fbNode.originPlace,
      confidence: 0.62,
      provenance: ['Audio & Provider Context'],
      node: fbNode,
    };
  }

  const primary = ranked[0].node;
  const secondaryFromSignals = ranked.slice(1, 4).map(r => r.node.name);
  const secondaryGenres = secondaryFromSignals.length > 0
    ? secondaryFromSignals
    : primary.adjacentGenres.slice(0, 2);

  return {
    primaryGenre: primary.name,
    secondaryGenres,
    superGenre: primary.superGenre,
    secondarySuperGenre: primary.secondarySuperGenre || '',
    originYear: primary.originYear,
    originPlace: primary.originPlace,
    confidence: Number(Math.min(0.98, Math.max(0.68, ranked[0].score)).toFixed(2)),
    provenance: [...ranked[0].sources],
    node: primary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. BUILD GENRE SHEET PAYLOAD (ONTOLOGY + LIVE TRACK / ARTIST / LABEL GRAPH)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the initial (instant 0ms) Genre Sheet payload for `openNativeGenreFast`,
 * combining the canonical Musicmap ontology node with contextual connections from
 * the currently playing track, artist, and label.
 */
export function buildInitialGenreSheetPayload(genreName, context = {}) {
  const node = resolveGenreNode(genreName);
  const curArtist = String(context.artist || '').replace(/\s*\(\d+\)\s*$/, '').trim();
  const curLabel = String(context.label || '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(sub-label.*?\)/i, '')
    .split('—')[0]
    .trim();
  const curTitle = String(context.title || '').trim();

  // Merge current artist & any cached collaborators into Pioneer & Inspired Artists
  const artistsList = [];
  const seenArtists = new Set();
  const pushArtist = (name, role) => {
    const clean = String(name || '').replace(/\s*\(\d+\)\s*$/, '').trim();
    if (!clean || clean === '—' || clean.toLowerCase() === 'various' || seenArtists.has(_norm(clean))) return;
    seenArtists.add(_norm(clean));
    artistsList.push({ name: clean, role });
  };

  if (curArtist) {
    pushArtist(curArtist, 'Currently Playing');
  }
  (context.collaborators || []).forEach(c => pushArtist(c, 'Collaborator / Credits'));
  (node.pioneerArtists || []).forEach(p => pushArtist(p, 'Genre Pioneer & Inspiration'));

  // Merge current label + canonical labels
  const labelsList = [];
  const seenLabels = new Set();
  const pushLabel = (name) => {
    const clean = String(name || '').replace(/\s*\(\d+\)\s*$/, '').trim();
    if (!clean || clean === '—' || /not on label/i.test(clean) || seenLabels.has(_norm(clean))) return;
    seenLabels.add(_norm(clean));
    labelsList.push(clean);
  };
  if (curLabel) pushLabel(curLabel);
  // If label had a series (e.g. "Delsin — Mantis"), also include the series!
  if (context.label && String(context.label).includes('—')) {
    const seriesPart = String(context.label).split('—')[1]?.replace(/\[.*?\]/g, '').trim();
    if (seriesPart) pushLabel(seriesPart);
  }
  (node.classicLabels || []).forEach(l => pushLabel(l));

  // Initial playable similar tracks (from reference tracks + context)
  const similarTracks = (node.referenceTracks || []).map((rt, idx) => ({
    id: `genre-ref-${node.id}-${idx}`,
    title: rt.title,
    artist: rt.artist,
    label: rt.label || '',
    year: rt.year || '',
    url: `resolve:${rt.artist} ${rt.title}`,
    provider: 'discogs',
    cover: '',
  }));

  return {
    id: `genre-${node.id}`,
    name: node.name,
    superGenre: node.superGenre,
    secondarySuperGenre: node.secondarySuperGenre || null,
    aliases: node.aliases || [],
    siblingGroup: node.siblingGroup || null,
    originYear: node.originYear || '',
    originPlace: node.originPlace || '',
    bpmRange: node.bpmRange || '',
    rhythmProfile: node.rhythmProfile || '',
    sonicTraits: node.sonicTraits || [],
    description: node.description || '',
    parentGenres: node.parentGenres || [],
    influences: node.influences || [],
    subgenres: node.subgenres || [],
    adjacentGenres: node.adjacentGenres || [],
    backlashAgainst: node.backlashAgainst || [],
    pioneerArtists: artistsList.map(a => a.name),
    artistRoles: artistsList,
    classicLabels: labelsList,
    eventContexts: node.eventContexts || [],
    similarTracks,
    contextTrackTitle: curTitle || null,
    contextArtistName: curArtist || null,
    provenance: context.provenance || ['Musicmap Ontology', 'Discogs & MusicBrainz Graph'],
  };
}
