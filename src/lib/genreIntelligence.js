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
// 2B. EXTENDED CLASSIC TRACKS (50%) & DEEP NICHE CUTS (50%) POOLS PER GENRE
// ─────────────────────────────────────────────────────────────────────────────

const EXTENDED_CLASSIC_TRACKS = {
  'detroit-techno': [
    { title: 'Sharevari', artist: 'A Number Of Names', year: '1981', label: 'Capriccio' },
    { title: 'Alleys of Your Mind', artist: 'Cybotron', year: '1981', label: 'Deep Space' },
    { title: 'Big Fun', artist: 'Inner City', year: '1988', label: 'KMS' },
    { title: 'Nude Photo', artist: 'Rhythim Is Rhythim', year: '1987', label: 'Transmat' },
    { title: 'Minimal Nation', artist: 'Robert Hood', year: '1994', label: 'Axis' },
    { title: 'Jupiter Jazz', artist: 'Underground Resistance', year: '1992', label: 'Underground Resistance' },
    { title: 'Wavejumper', artist: 'Drexciya', year: '1995', label: 'Underground Resistance' },
    { title: 'Bug in the Bassbin', artist: 'Innerzone Orchestra', year: '1992', label: 'Planet E' },
  ],
  'dub-techno': [
    { title: 'Quadrant Dub I', artist: 'Basic Channel', year: '1994', label: 'Basic Channel' },
    { title: 'Domina (Maurizio Mix)', artist: 'Maurizio', year: '1993', label: 'Maurizio' },
    { title: 'Starlight', artist: 'Model 500', year: '1995', label: 'R&S / Echocord' },
    { title: 'Liumin', artist: 'DeepChord presents Echospace', year: '2010', label: 'Modern Love' },
    { title: 'Submerged', artist: 'Fluxion', year: '1999', label: 'Chain Reaction' },
    { title: 'King in My Empire', artist: 'Rhythm & Sound w/ Cornell Campbell', year: '2001', label: 'Burial Mix' },
    { title: 'Rhythm', artist: 'Tikiman & Basic Channel', year: '1996', label: 'Main Street' },
  ],
  'hypnotic-techno': [
    { title: 'Subzero', artist: 'Ben Klock', year: '2009', label: 'Ostgut Ton' },
    { title: 'the bells (Jeff Mills)', artist: 'Jeff Mills', year: '1996', label: 'Purpose Maker' },
    { title: 'Hunting Ground', artist: 'Sandwell District', year: '2010', label: 'Sandwell District' },
    { title: 'Phobos', artist: 'Speedy J & Chris Liebing', year: '2002', label: 'CLR' },
    { title: 'Prowler', artist: 'Surgeon', year: '1997', label: 'Downwards' },
    { title: 'Anaconda', artist: 'Oscar Mulero', year: '2004', label: 'Warm Up' },
    { title: 'spastik', artist: 'Plastikman', year: '1993', label: 'Plus 8' },
  ],
  'minimal-techno': [
    { title: 'Spastik', artist: 'Plastikman', year: '1993', label: 'Plus 8' },
    { title: 'Tessio', artist: 'Luomo', year: '2000', label: 'Force Tracks' },
    { title: 'Decks, EFX & 909', artist: 'Richie Hawtin', year: '1999', label: 'Minus' },
    { title: 'Silbersee', artist: 'Wolfgang Voigt', year: '1997', label: 'Profan' },
    { title: 'Alcachofa', artist: 'Ricardo Villalobos', year: '2003', label: 'Playhouse' },
    { title: 'Dancer', artist: 'Robert Hood', year: '1994', label: 'M-Plant' },
  ],
  'industrial-techno': [
    { title: 'Why They Hide Their Bodies Under My Garage?', artist: 'Blawan', year: '2012', label: 'Hinge Finger' },
    { title: 'Speak To Me', artist: 'Regis', year: '1996', label: 'Downwards' },
    { title: 'Destroy All Monsters', artist: 'Perc', year: '2014', label: 'Perc Trax' },
    { title: 'Join in the Chant', artist: 'Nitzer Ebb', year: '1987', label: 'Mute' },
    { title: 'Headhunter', artist: 'Front 242', year: '1988', label: 'RRE' },
  ],
  'acid-techno': [
    { title: 'Acperience 1', artist: 'Hardfloor', year: '1992', label: 'Harthouse' },
    { title: 'Energy Flash', artist: 'Joey Beltram', year: '1990', label: 'R&S Records' },
    { title: 'One Night in Hackney', artist: 'Dave The Drummer & Chris Liberator', year: '2000', label: 'Stay Up Forever' },
    { title: 'Acid Eiffel', artist: 'Choice (Laurent Garnier)', year: '1993', label: 'Fnac Music' },
    { title: '101', artist: 'Aphex Twin', year: '1992', label: 'R&S' },
  ],
  'ambient-techno': [
    { title: 'Xtal', artist: 'Aphex Twin', year: '1992', label: 'Apollo / R&S' },
    { title: 'Papua New Guinea', artist: 'The Future Sound of London', year: '1991', label: 'Jumpin\' & Pumpin\'' },
    { title: 'Halcyon + On + On', artist: 'Orbital', year: '1992', label: 'Internal' },
    { title: '28 Gun Bad Boy', artist: 'Autechre', year: '1993', label: 'Warp' },
    { title: 'clear', artist: 'B12', year: '1993', label: 'Warp' },
  ],
  'chicago-house': [
    { title: 'Your Love', artist: 'Frankie Knuckles & Jamie Principle', year: '1987', label: 'Trax Records' },
    { title: 'Move Your Body', artist: 'Marshall Jefferson', year: '1986', label: 'Trax Records' },
    { title: 'On and On', artist: 'Jesse Saunders', year: '1984', label: 'Jes Say' },
    { title: 'French Kiss', artist: 'Lil Louis', year: '1989', label: 'Diamond Records' },
    { title: 'Promised Land', artist: 'Joe Smooth', year: '1987', label: 'DJ International' },
    { title: 'Music Sounds Better With You', artist: 'Stardust', year: '1998', label: 'Roulé' },
  ],
  'deep-house': [
    { title: 'Can You Feel It', artist: 'Mr. Fingers (Larry Heard)', year: '1986', label: 'Trax Records' },
    { title: 'Mystery of Love', artist: 'Fingers Inc.', year: '1985', label: 'DJ International' },
    { title: 'Shades of Jae', artist: 'Moodymann', year: '1999', label: 'KDJ' },
    { title: 'Show Me Love', artist: 'Robin S.', year: '1993', label: 'Big Beat' },
    { title: 'Brighter Days (Underground Goodies Mix)', artist: 'Cajmere ft. Dajae', year: '1992', label: 'Cajual' },
    { title: 'Gypsy Woman (She\'s Homeless)', artist: 'Crystal Waters', year: '1991', label: 'Mercury' },
    { title: 'Rose Rouge', artist: 'St Germain', year: '2000', label: 'Blue Note' },
  ],
  'acid-house': [
    { title: 'Acid Tracks', artist: 'Phuture', year: '1987', label: 'Trax Records' },
    { title: 'Voodoo Ray', artist: 'A Guy Called Gerald', year: '1988', label: 'Rham!' },
    { title: 'Washing Machine', artist: 'Mr. Fingers', year: '1986', label: 'Trax' },
    { title: 'Stakker Humanoid', artist: 'Humanoid', year: '1988', label: 'Westside' },
    { title: 'Pacific State', artist: '808 State', year: '1989', label: 'ZTT' },
  ],
  'tech-house': [
    { title: 'Bells of Brighton', artist: 'Mr. C', year: '1996', label: 'End Recordings' },
    { title: 'Cola', artist: 'CamelPhat & Elderbrook', year: '2017', label: 'Defected' },
    { title: 'plastic dreams', artist: 'Jaydee', year: '1992', label: 'R&S' },
    { title: 'Born Slippy', artist: 'Underworld', year: '1995', label: 'Junior Boy\'s Own' },
  ],
  'electro': [
    { title: 'Clear', artist: 'Cybotron', year: '1983', label: 'Fantasy' },
    { title: 'Planet Rock', artist: 'Afrika Bambaataa & The Soul Sonic Force', year: '1982', label: 'Tommy Boy' },
    { title: 'Numbers', artist: 'Kraftwerk', year: '1981', label: 'Kling Klang' },
    { title: 'Andrea Parker — Melodious Thunk', artist: 'Andrea Parker', year: '1995', label: 'Mo\' Wax' },
    { title: 'Space Invaders Are Smoking Grass', artist: 'I-F', year: '1997', label: 'Interdimensional Transmissions' },
  ],
  'jungle': [
    { title: 'Original Nuttah', artist: 'UK Apachi & Shy FX', year: '1994', label: 'SOUR' },
    { title: 'Inner City Life', artist: 'Goldie', year: '1994', label: 'Metalheadz' },
    { title: 'Valley of the Shadows', artist: 'Origin Unknown', year: '1993', label: 'RAM Records' },
    { title: 'Super Sharp Shooter', artist: 'DJ Zinc', year: '1995', label: 'Parousia' },
    { title: 'Renegade Snares (Foul Play VIP)', artist: 'Omni Trio', year: '1993', label: 'Moving Shadow' },
    { title: 'Atlantis (I Need You)', artist: 'LTJ Bukem', year: '1993', label: 'Good Looking' },
  ],
  'drum-n-bass': [
    { title: 'Alien Girl', artist: 'Ed Rush, Optical & Fierce', year: '1998', label: 'Prototype' },
    { title: 'LK ( Carolina Carol Bela )', artist: 'DJ Marky & XRS', year: '2002', label: 'V Recordings' },
    { title: 'Mr. Majestic', artist: 'Calibre & High Contrast', year: '2004', label: 'Signature' },
    { title: 'The Nine', artist: 'Bad Company UK', year: '1998', label: 'BC Recordings' },
    { title: 'Shadow Boxing', artist: 'Nasty Habits (Doc Scott)', year: '1996', label: '31 Records' },
    { title: 'Brown Paper Bag', artist: 'Roni Size / Reprazent', year: '1997', label: 'Talkin\' Loud' },
  ],
  'uk-garage-2-step': [
    { title: 'Sincere', artist: 'MJ Cole', year: '1998', label: 'Talkin\' Loud' },
    { title: 'RipGroove', artist: 'Double 99', year: '1997', label: 'Satellite' },
    { title: 'Flowers', artist: 'Sweet Female Attitude', year: '2000', label: 'Milkk' },
    { title: 'Gabriel', artist: 'Roy Davis Jr. ft. Peven Everett', year: '1996', label: 'Large Music' },
    { title: '21 Seconds', artist: 'So Solid Crew', year: '2001', label: 'Relentless' },
  ],
  'dubstep': [
    { title: 'Anti-War Dub', artist: 'Digital Mystikz (Mala)', year: '2006', label: 'DMZ' },
    { title: 'Midnight Request Line', artist: 'Skream', year: '2005', label: 'Tempa' },
    { title: 'Archangel', artist: 'Burial', year: '2007', label: 'Hyperdub' },
    { title: 'Night', artist: 'Benga & Coki', year: '2008', label: 'Tempa' },
    { title: 'Horror Show', artist: 'Loefah', year: '2004', label: 'DMZ' },
  ],
  'footwork-juke': [
    { title: 'Battle', artist: 'RP Boo', year: '2013', label: 'Planet Mu' },
    { title: 'In Da Getto', artist: 'DJ Rashad & DJ Spinn', year: '2013', label: 'Hyperdub' },
    { title: 'Work It', artist: 'DJ Clent', year: '2006', label: 'Dance Mania' },
    { title: 'Burn That Kush', artist: 'DJ Manny', year: '2017', label: 'Teklife' },
  ],
  'uk-bass-leftfield-bass': [
    { title: 'CMYK', artist: 'James Blake', year: '2010', label: 'R&S' },
    { title: 'percussion lab', artist: 'Peverelist', year: '2009', label: 'Punch Drunk' },
    { title: 'Drum Pan Sound', artist: 'Pangaea', year: '2012', label: 'Hessle Audio' },
    { title: 'Subtextures', artist: 'Batu', year: '2018', label: 'Timedance' },
  ],
  'breakbeat': [
    { title: 'Beat Dis', artist: 'Bomb The Bass', year: '1988', label: 'Mister-Ron' },
    { title: 'Block Rockin\' Beats', artist: 'The Chemical Brothers', year: '1997', label: 'Virgin' },
    { title: 'Smack My Bitch Up', artist: 'The Prodigy', year: '1997', label: 'XL Recordings' },
    { title: 'Rez / Cowgirl', artist: 'Underworld', year: '1993', label: 'Junior Boy\'s Own' },
  ],
  'idm-braindance': [
    { title: 'Windowlicker', artist: 'Aphex Twin', year: '1999', label: 'Warp' },
    { title: 'Roygbiv', artist: 'Boards of Canada', year: '1998', label: 'Warp / Skam' },
    { title: '4', artist: 'Aphex Twin', year: '1996', label: 'Warp' },
    { title: 'Red Currant', artist: 'Squarepusher', year: '1997', label: 'Warp' },
    { title: 'Flim', artist: 'Aphex Twin', year: '1997', label: 'Warp' },
  ],
  'ambient': [
    { title: '1/1 (Music for Airports)', artist: 'Brian Eno', year: '1978', label: 'Polydor' },
    { title: '#3 (Rhubarb)', artist: 'Aphex Twin', year: '1994', label: 'Warp' },
    { title: 'Structures from Silence', artist: 'Steve Roach', year: '1984', label: 'Fortuna' },
    { title: 'Through Hollow Lands', artist: 'Brian Eno', year: '1977', label: 'Island' },
  ],
  'downtempo': [
    { title: 'Teardrop', artist: 'Massive Attack', year: '1998', label: 'Virgin' },
    { title: 'Glory Box', artist: 'Portishead', year: '1994', label: 'Go! Beat' },
    { title: 'La Femme d\'Argent', artist: 'Air', year: '1998', label: 'Source' },
    { title: 'Lebanese Blonde', artist: 'Thievery Corporation', year: '1998', label: 'ESL Music' },
  ],
  'trance': [
    { title: 'Cafe Del Mar', artist: 'Energy 52', year: '1993', label: 'Eye Q' },
    { title: 'For An Angel', artist: 'Paul van Dyk', year: '1994', label: 'MFS' },
    { title: 'Universal Nation', artist: 'Push', year: '1998', label: 'Bonzai' },
    { title: 'Greece 2000', artist: 'Three Drives On A Vinyl', year: '1997', label: 'Massive Drive' },
  ],
  'dub': [
    { title: 'King Tubby Meets Rockers Uptown', artist: 'Augustus Pablo & King Tubby', year: '1974', label: 'Yard Music' },
    { title: 'Chase The Devil', artist: 'Max Romeo & The Upsetters', year: '1976', label: 'Island' },
    { title: 'Declaration of Dub', artist: 'King Tubby', year: '1975', label: 'Clocktower' },
    { title: 'Fistful of Dollars', artist: 'Scientist', year: '1981', label: 'Greensleeves' },
  ],
  'roots-reggae': [
    { title: 'Police and Thieves', artist: 'Junior Murvin', year: '1976', label: 'Island' },
    { title: 'Marcus Garvey', artist: 'Burning Spear', year: '1975', label: 'Island' },
    { title: 'Two Sevens Clash', artist: 'Culture', year: '1977', label: 'Joe Gibbs' },
    { title: 'Bam Bam', artist: 'Sister Nancy', year: '1982', label: 'Techniques' },
  ],
  'hip-hop-boom-bap': [
    { title: 'Shook Ones (Part II)', artist: 'Mobb Deep', year: '1995', label: 'Loud' },
    { title: 'N.Y. State of Mind', artist: 'Nas', year: '1994', label: 'Columbia' },
    { title: 'C.R.E.A.M.', artist: 'Wu-Tang Clan', year: '1993', label: 'Loud' },
    { title: 'Electric Relaxation', artist: 'A Tribe Called Quest', year: '1993', label: 'Jive' },
  ],
  'trap-cloud-rap-drill': [
    { title: 'March Madness', artist: 'Future', year: '2015', label: 'Freebandz' },
    { title: 'Welcome to the Party', artist: 'Pop Smoke', year: '2019', label: 'Victor Victor' },
    { title: 'Ginseng Strip 2002', artist: 'Yung Lean', year: '2013', label: 'Sad Boys' },
    { title: 'XO Tour Llif3', artist: 'Lil Uzi Vert', year: '2017', label: 'Generation Now' },
  ],
  'grime': [
    { title: 'I Luv U', artist: 'Dizzee Rascal', year: '2003', label: 'XL Recordings' },
    { title: 'Functions on the Low', artist: 'Ruff Sqwad (XTC)', year: '2004', label: 'White Label' },
    { title: 'Shutdown', artist: 'Skepta', year: '2015', label: 'Boy Better Know' },
    { title: 'Pulse X', artist: 'Youngstar', year: '2002', label: 'DDJs' },
  ],
  'jazz-spiritual-jazz-fusion': [
    { title: 'So What', artist: 'Miles Davis', year: '1959', label: 'Columbia' },
    { title: 'The Creator Has a Master Plan', artist: 'Pharoah Sanders', year: '1969', label: 'Impulse!' },
    { title: 'Chameleon', artist: 'Herbie Hancock', year: '1973', label: 'Columbia' },
    { title: 'Giant Steps', artist: 'John Coltrane', year: '1960', label: 'Atlantic' },
  ],
  'soul-funk-boogie': [
    { title: 'What\'s Going On', artist: 'Marvin Gaye', year: '1971', label: 'Tamla / Motown' },
    { title: 'Flash Light', artist: 'Parliament', year: '1977', label: 'Casablanca' },
    { title: 'Never Too Much', artist: 'Luther Vandross', year: '1981', label: 'Epic' },
    { title: 'Keep On Movin\'', artist: 'Soul II Soul', year: '1989', label: '10 Records' },
  ],
  'post-punk-coldwave-synth-pop': [
    { title: 'Blue Monday', artist: 'New Order', year: '1983', label: 'Factory' },
    { title: 'A Forest', artist: 'The Cure', year: '1980', label: 'Fiction' },
    { title: 'Das Model', artist: 'Kraftwerk', year: '1978', label: 'Kling Klang' },
    { title: 'Warm Leatherette', artist: 'The Normal', year: '1978', label: 'Mute' },
  ],
  'krautrock-kosmische': [
    { title: 'Hallogallo', artist: 'NEU!', year: '1972', label: 'Brain' },
    { title: 'Trans-Europe Express', artist: 'Kraftwerk', year: '1977', label: 'Kling Klang' },
    { title: 'Phaedra', artist: 'Tangerine Dream', year: '1974', label: 'Virgin' },
    { title: 'E2-E4', artist: 'Manuel Göttsching', year: '1984', label: 'Inteam' },
  ],
  'alternative-indie-shoegaze': [
    { title: 'When You Sleep', artist: 'My Bloody Valentine', year: '1991', label: 'Creation' },
    { title: 'Alison', artist: 'Slowdive', year: '1993', label: 'Creation' },
    { title: 'Everything In Its Right Place', artist: 'Radiohead', year: '2000', label: 'Parlophone' },
    { title: 'Disorder', artist: 'Joy Division', year: '1979', label: 'Factory' },
  ],
  'afrobeat-global-groove': [
    { title: 'Water No Get Enemy', artist: 'Fela Kuti', year: '1975', label: 'Expensive' },
    { title: 'Love & Death', artist: 'Ebo Taylor', year: '2010', label: 'Strut' },
    { title: 'Wede Harer Guzo', artist: 'Hailu Mergia & Dahlak Band', year: '1978', label: 'Kaifa / Awesome Tapes' },
    { title: 'Ayonha', artist: 'Hamid Al Shaeri', year: '1982', label: 'Slam / Habibi Funk' },
  ],
};

const DEEP_NICHE_TRACKS = {
  'detroit-techno': [
    { title: 'Solitary', artist: 'Convextion', year: '2006', label: 'Down Low Music' },
    { title: 'Beyond the Dance (Cult Mix)', artist: 'Rhythim Is Rhythim', year: '1989', label: 'Transmat' },
    { title: 'The Theory', artist: '69 (Carl Craig)', year: '1991', label: 'Planet E' },
    { title: 'Star Dancer', artist: 'Red Planet (The Martian)', year: '1993', label: 'Red Planet' },
    { title: 'Vortex', artist: 'Kenny Larkin', year: '1994', label: 'Warp / Plus 8' },
    { title: 'Hydro Theory', artist: 'Drexciya', year: '1999', label: 'Tresor' },
    { title: 'Metropolis', artist: 'Jeff Mills', year: '2000', label: 'Tresor' },
    { title: 'Untold', artist: ' Claude Young', year: '1995', label: 'Utensil' },
    { title: 'Sonic Sunset', artist: 'Suburban Knight', year: '1990', label: 'Transmat' },
    { title: 'Mind Rich', artist: 'Psyche (Carl Craig)', year: '1990', label: 'Transmat' },
  ],
  'dub-techno': [
    { title: '2556', artist: 'Convextion', year: '2016', label: 'Mojuba' },
    { title: 'Substrat', artist: 'Vainqueur', year: '1996', label: 'Chain Reaction' },
    { title: 'Largo', artist: 'Fluxion', year: '1998', label: 'Chain Reaction' },
    { title: 'Rican Beach', artist: 'Vladislav Delay', year: '2000', label: 'Chain Reaction' },
    { title: 'Snowflake #2', artist: 'Yagya', year: '2009', label: 'Subwax Bcn' },
    { title: 'Intrusion Dub', artist: 'Intrusion (cv313)', year: '2008', label: 'echospace [detroit]' },
    { title: 'Untitled B1 (Styrax Leaves 05)', artist: 'Silent Servant', year: '2006', label: 'Styrax Leaves' },
    { title: 'Gutter', artist: 'Prince of Denmark', year: '2013', label: 'Forum' },
    { title: 'Cyan', artist: 'Monolake', year: '1996', label: 'Chain Reaction' },
    { title: 'Echoes of Silence', artist: 'Quantec', year: '2008', label: 'Echocord' },
  ],
  'hypnotic-techno': [
    { title: 'System', artist: 'Forest Drive West', year: '2018', label: 'Livity Sound' },
    { title: 'Parallel Mains', artist: 'Forest Drive West', year: '2021', label: 'Rupture / Ilian Tape' },
    { title: 'Spirals', artist: 'Luigi Tozzi', year: '2016', label: 'Hypnus Records' },
    { title: 'K', artist: 'Donato Dozzy', year: '2013', label: 'Further Records' },
    { title: 'Zemlya', artist: 'Abdulla Rashim', year: '2012', label: 'Abdulla Rashim Records' },
    { title: '012', artist: 'Claudio PRC', year: '2012', label: 'Prologue' },
    { title: 'Pentagon', artist: 'Rrose', year: '2013', label: 'Eaux' },
    { title: 'Nautilus', artist: 'Cio D\'Or', year: '2009', label: 'Prologue' },
    { title: 'Immolare', artist: 'Silent Servant', year: '2012', label: 'Hospital Productions' },
    { title: 'Surgeon — Floorshow Pt. 1', artist: 'Surgeon', year: '2005', label: 'Counterbalance' },
  ],
  'minimal-techno': [
    { title: 'Bells (000003)', artist: 'baby ford & the ifach collective', year: '2000', label: 'Ifach' },
    { title: 'Picanha', artist: 'Perlon / Pantytec', year: '2002', label: 'Perlon' },
    { title: 'Snap', artist: 'DBX (Daniel Bell)', year: '1994', label: 'Accelerate' },
    { title: 'Point', artist: 'Rhadoo', year: '2011', label: '[a:rpia:r]' },
    { title: 'My Black Sheep', artist: 'Len Faki', year: '2007', label: 'Podium' },
    { title: 'Korn', artist: 'Studio 1 (Wolfgang Voigt)', year: '1996', label: 'Studio 1' },
    { title: 'Mirage', artist: 'Petre Inspirescu', year: '2009', label: 'Yojik ConCon' },
    { title: 'Minimal 4', artist: 'Thomas Brinkmann', year: '1998', label: 'Ernst' },
  ],
  'industrial-techno': [
    { title: 'adolescence', artist: 'British Murder Boys', year: '2003', label: 'Downwards' },
    { title: 'Bite', artist: 'Ancient Methods', year: '2007', label: 'Ancient Methods' },
    { title: 'Vatican Shadow — Kneeling Soldiers', artist: 'Vatican Shadow', year: '2011', label: 'Hospital Productions' },
    { title: 'In the Dark', artist: 'Paula Temple', year: '2014', label: 'Noise Manifesto' },
    { title: 'Flesh & Bone', artist: 'Orphx', year: '2015', label: 'Sonic Groove' },
    { title: 'Cold Witness', artist: 'Phase Fatale', year: '2018', label: 'Ostgut Ton' },
    { title: 'Tantrum', artist: 'Ansome', year: '2016', label: 'Perc Trax' },
    { title: 'No Escape', artist: 'Tzusing', year: '2017', label: 'L.I.E.S.' },
  ],
  'acid-techno': [
    { title: '303 Power', artist: 'Tin Man', year: '2014', label: 'Acid Test' },
    { title: 'Acid Track B2', artist: 'TM404 (Andreas Tilliander)', year: '2013', label: 'Kontra-Musik' },
    { title: 'Jack', artist: 'Recondite', year: '2012', label: 'Acid Test' },
    { title: 'Universal Indicator Red A1', artist: 'Mike Dred & Aphex Twin', year: '1992', label: 'Rephlex' },
    { title: 'Stasis — Point of No Return', artist: 'Boston 168', year: '2016', label: 'Involve' },
    { title: 'The Prophet', artist: 'CJ Bolland', year: '1996', label: 'Internal' },
    { title: 'Mental Overdrive', artist: 'Woody McBride', year: '1994', label: 'Communique' },
    { title: '923', artist: 'paranoid london', year: '2012', label: 'Paranoid London' },
  ],
  'ambient-techno': [
    { title: 'Firescope', artist: 'B12', year: '1993', label: 'Warp' },
    { title: 'Vril — Torus XXXII', artist: 'Vril', year: '2014', label: 'Giegling' },
    { title: '2 The Sky', artist: 'DJ Metatron', year: '2016', label: 'Giegling' },
    { title: 'Lichen', artist: 'Aphex Twin', year: '1994', label: 'Warp' },
    { title: 'Bochum', artist: 'Plaid', year: '1997', label: 'Warp' },
    { title: 'Skee Mask — Dial 274', artist: 'Skee Mask', year: '2018', label: 'Ilian Tape' },
    { title: 'Neptune', artist: 'Stasis', year: '1993', label: 'Peacefrog' },
    { title: 'Sun Electric — O\'Locco', artist: 'Sun Electric', year: '1990', label: 'R&S' },
  ],
  'chicago-house': [
    { title: 'Track 4', artist: 'Armando', year: '1988', label: 'Warehouse' },
    { title: 'No Way Back', artist: 'Adonis', year: '1986', label: 'Trax Records' },
    { title: 'Work It to the Bone', artist: 'LNR', year: '1987', label: 'House Jam' },
    { title: 'Percolator', artist: 'Cajmere', year: '1992', label: 'Cajual' },
    { title: 'Video Clash', artist: 'Lil Louis', year: '1988', label: 'Dance Mania' },
    { title: 'Bango', artist: 'Boo Williams', year: '1996', label: 'Relief' },
    { title: 'House Nation', artist: 'The House Master Boyz', year: '1986', label: 'Dance Mania' },
    { title: 'Lost in the Groove', artist: 'Glenn Underground', year: '1996', label: 'Peacefrog' },
  ],
  'deep-house': [
    { title: '3 Chairs Theme', artist: '3 Chairs (Rick Wilhite, Marcellus Pittman, Theo Parrish, Moodymann)', year: '2004', label: 'Three Chairs' },
    { title: 'sketches', artist: 'Galcher Lustwerk', year: '2013', label: 'Lustwerk Music' },
    { title: 'Missing You', artist: 'Larry Heard', year: '1996', label: 'Track Mode' },
    { title: 'Solitary Flight', artist: 'Theo Parrish', year: '2002', label: 'Sound Signature' },
    { title: 'What U Do', artist: 'Motor City Drum Ensemble', year: '2008', label: 'MCDE' },
    { title: 'Everywhere You Go', artist: 'Fred P (Black Jazz Consortium)', year: '2009', label: 'Soul People Music' },
    { title: 'Tribute', artist: 'Mood Hut / Jack J', year: '2015', label: 'Mood Hut' },
    { title: 'Deep Burnt', artist: 'Pepe Bradock', year: '1999', label: 'Kif Recordings' },
    { title: 'Jus Dance', artist: 'Mr. G', year: '2010', label: 'Rekids' },
    { title: 'Red Nail', artist: 'Omar-S', year: '2009', label: 'FXHE' },
  ],
  'acid-house': [
    { title: 'In the Mix', artist: 'Bam Bam', year: '1988', label: 'Westbrook' },
    { title: 'I\'ve Lost Control', artist: 'Sleezy D.', year: '1986', label: 'Trax Records' },
    { title: 'Box Energy', artist: 'DJ Pierre', year: '1988', label: 'Trax Records' },
    { title: 'Dream Girl', artist: 'Pierre\'s Pfantasy Club', year: '1988', label: 'Sutra' },
    { title: 'Eating Glue', artist: 'Paranoid London', year: '2013', label: 'Paranoid London' },
    { title: '151', artist: 'Armando', year: '1988', label: 'Warehouse' },
  ],
  'tech-house': [
    { title: 'Layo & Bushwacka! — Low Life', artist: 'Layo & Bushwacka!', year: '1999', label: 'End Recordings' },
    { title: 'As Pure As Snow', artist: 'Terry Lee Brown Jr.', year: '1997', label: 'Plastic City' },
    { title: 'Gidge —The Time Complex', artist: 'Timewriter', year: '1998', label: 'Plastic City' },
    { title: 'Erotic Discourse', artist: 'Paul Woolford', year: '2006', label: '20:20 Vision' },
    { title: 'Gamble', artist: 'Pearson Sound', year: '2013', label: 'Night Slugs' },
    { title: 'Wiggle', artist: 'Nathan Coles & Terry Francis', year: '1998', label: 'Wiggle' },
  ],
  'electro': [
    { title: '20000 Leagues Under the Sea', artist: 'Drexciya', year: '1999', label: 'Tresor' },
    { title: 'Vainqueur — Lyot (Maurizio Mix)', artist: 'E.R.P. (Gerard Hanson)', year: '2005', label: 'Frustrated Funk' },
    { title: 'Ghetto Bass', artist: 'Aux 88', year: '1996', label: 'Direct Beat' },
    { title: 'Freq', artist: 'Dopplereffekt', year: '1999', label: 'Dataphysix' },
    { title: 'Altered State', artist: 'Carl Finlow', year: '2002', label: '20:20 Vision' },
    { title: '02', artist: 'Cultek', year: '2018', label: 'CPU' },
    { title: 'Microchip', artist: 'DMX Krew', year: '1999', label: 'Rephlex' },
    { title: 'Arpanet — Wireless Internet', artist: 'Arpanet (Gerald Donald)', year: '2002', label: 'Record Makers' },
  ],
  'jungle': [
    { title: 'Pulp Fiction', artist: 'Alex Reece', year: '1995', label: 'Metalheadz' },
    { title: 'The Angels Fell', artist: 'Dillinja', year: '1995', label: 'Metalheadz' },
    { title: 'Ni Ten Ichi Ryu', artist: 'Photek', year: '1997', label: 'Science' },
    { title: 'SoVain', artist: 'Source Direct', year: '1995', label: 'Metalheadz' },
    { title: 'Ruffige', artist: 'Sully', year: '2020', label: 'Astrophonica' },
    { title: 'Babylon', artist: 'Splash', year: '1995', label: 'Dee Jay Recordings' },
    { title: 'jah know ya big', artist: 'Dillinja', year: '1995', label: 'Metalheadz' },
    { title: '5ives', artist: 'Sully', year: '2021', label: 'Over/Shadow' },
    { title: 'Mantra — Lucid', artist: 'Mantra & Decibella', year: '2021', label: 'RuptureLDN' },
  ],
  'drum-n-bass': [
    { title: 'Bleach', artist: 'dBridge & Instra:mental', year: '2009', label: 'Autonomic' },
    { title: 'Drop It Down', artist: 'Calibre ft. Singing Fats', year: '2004', label: 'Signature' },
    { title: 'Empty Streets', artist: 'Cyantific', year: '2010', label: 'Hospital' },
    { title: 'Cutslo (Lokuste Mix)', artist: 'Ed Rush, Optical & Fierce', year: '1998', label: 'Prototype' },
    { title: 'Samurai Dub', artist: 'Presha / Paradox', year: '2018', label: 'Samurai Music' },
    { title: 'No Reality', artist: 'ASC', year: '2011', label: 'Nonplus' },
    { title: 'True Romance', artist: 'dBridge & Vegas', year: '2004', label: 'Metalheadz Platinum' },
    { title: 'Metropolis', artist: 'Adam F', year: '1997', label: 'Metalheadz' },
  ],
  'uk-garage-2-step': [
    { title: 'Joy', artist: 'El-B ft. Juiceman', year: '2001', label: 'Ghost Recordings' },
    { title: 'Battle', artist: 'Wookie', year: '2000', label: 'S2S' },
    { title: 'neighbourhood', artist: 'Zed Bias', year: '2000', label: 'Locked On' },
    { title: '138 Trek', artist: 'DJ Zinc', year: '2000', label: 'Bingo Beats' },
    { title: 'Buck & Bury', artist: 'El-B', year: '2000', label: 'Ghost' },
    { title: 'Over Here', artist: 'Menta (Artwork & Danny J)', year: '2002', label: 'Sounds of Da Future' },
    { title: 'Overload', artist: 'Interplanetary Criminal', year: '2021', label: 'Time Is Now' },
  ],
  'dubstep': [
    { title: 'Mud', artist: 'Loefah', year: '2006', label: 'DMZ' },
    { title: 'Alicia', artist: 'Mala', year: '2007', label: 'White Label' },
    { title: 'Bury Da Bwoy', artist: 'Kahn & Neek', year: '2012', label: 'Bandulu' },
    { title: 'Roll With the Punches', artist: 'Peverelist', year: '2007', label: 'Punch Drunk' },
    { title: 'Qawwali', artist: 'Pinch', year: '2006', label: 'Planet Mu' },
    { title: 'Fat Larry\'s Skank', artist: 'Kode9 & The Spaceape', year: '2006', label: 'Hyperdub' },
    { title: 'Spongebob', artist: 'Coki', year: '2007', label: 'DMZ' },
    { title: 'Abattoir', artist: 'Kahn', year: '2014', label: 'Deep Medi' },
  ],
  'footwork-juke': [
    { title: '187', artist: 'RP Boo', year: '2013', label: 'Planet Mu' },
    { title: 'Ghost', artist: 'Jlin', year: '2015', label: 'Planet Mu' },
    { title: 'I Don\'t Give A Fuck', artist: 'DJ Earl', year: '2016', label: 'Teklife' },
    { title: 'Space Juke', artist: 'DJ Roc', year: '2010', label: 'Planet Mu' },
    { title: 'All Night', artist: 'DJ Taye', year: '2018', label: 'Hyperdub' },
    { title: '11-47-99', artist: 'RP Boo', year: '1999', label: 'Dance Mania' },
  ],
  'uk-bass-leftfield-bass': [
    { title: 'Sublow', artist: 'Lurka', year: '2014', label: 'Black Acre' },
    { title: 'Tumble', artist: 'Peverelist & Kowton', year: '2012', label: 'Livity Sound' },
    { title: 'Ploy — Ramos', artist: 'Ploy', year: '2018', label: 'Timedance' },
    { title: 'Sigha & Hodge — Percussion', artist: 'Hodge', year: '2015', label: 'Livity Sound' },
    { title: 'Vex', artist: 'Pearson Sound', year: '2011', label: 'Hessle Audio' },
    { title: 'Cavity', artist: 'Objekt', year: '2012', label: 'Hessle Audio' },
    { title: 'Azimuth', artist: 'Bruce', year: '2016', label: 'Timedance' },
  ],
  'breakbeat': [
    { title: 'Tekno Jam', artist: 'Bicep', year: '2017', label: 'Ninja Tune' },
    { title: 'Coma Cat', artist: 'Stanton Warriors', year: '2001', label: 'Punks' },
    { title: 'Musak (Wonderland Avenue)', artist: 'Trisco', year: '2001', label: 'Positiva' },
    { title: 'Xpander (Breaks Mix)', artist: 'Sasha', year: '1999', label: 'Deconstruction' },
    { title: 'Fear', artist: 'Adam Freeland', year: '2003', label: 'Marine Parade' },
    { title: 'Two Months Off', artist: 'Overmono', year: '2022', label: 'XL Recordings' },
  ],
  'idm-braindance': [
    { title: 'Gantz Graf', artist: 'Autechre', year: '2002', label: 'Warp' },
    { title: 'charlie\'s family', artist: 'Bogdan Raczynski', year: '1999', label: 'Rephlex' },
    { title: 'Fenix Funk 5', artist: 'AFX (Aphex Twin)', year: '2005', label: 'Rephlex' },
    { title: 'Aquarius', artist: 'Boards of Canada', year: '1998', label: 'Warp' },
    { title: 'cvalda', artist: 'Oval', year: '1995', label: 'Mille Plateaux' },
    { title: 'Tri Repetae — Eutow', artist: 'Autechre', year: '1995', label: 'Warp' },
    { title: 'My Red Hot Car', artist: 'Squarepusher', year: '2001', label: 'Warp' },
  ],
  'ambient': [
    { title: 'Watermusic I', artist: 'William Basinski', year: '2001', label: '2062' },
    { title: 'Clearing', artist: 'Grouper', year: '2013', label: 'Kranky' },
    { title: 'Mizu No Naka No Bagatelle', artist: 'Hiroshi Yoshimura', year: '1986', label: 'Air' },
    { title: 'Kankyo', artist: 'Midori Takada', year: '1983', label: 'RCA Red Seal' },
    { title: 'Pop 4', artist: 'GAS (Wolfgang Voigt)', year: '2000', label: 'Mille Plateaux' },
    { title: 'Substrata — Sphere', artist: 'Biosphere', year: '1997', label: 'All Saints' },
  ],
  'downtempo': [
    { title: 'Building Steam With a Grain of Salt', artist: 'DJ Shadow', year: '1996', label: 'Mo\' Wax' },
    { title: 'Les Nuits', artist: 'Nightmares on Wax', year: '1999', label: 'Warp' },
    { title: 'Sofa Rockers (Richard Dorfmeister Mix)', artist: 'Kruder & Dorfmeister', year: '1998', label: 'G-Stone' },
    { title: 'Pacific Coliseum — Ocean City', artist: 'Pacific Coliseum', year: '2017', label: 'Coastal Haze' },
    { title: 'At the River', artist: 'Groove Armada', year: '1997', label: 'Pepper' },
    { title: 'Nautical Dub', artist: 'Roots Manuva', year: '1999', label: 'Big Dada' },
  ],
  'trance': [
    { title: 'Stella', artist: 'Jam & Spoon', year: '1992', label: 'R&S' },
    { title: 'The Age of Love (Jam & Spoon Watch Out For Stella Mix)', artist: 'Age of Love', year: '1992', label: 'DiKi' },
    { title: 'L\'Esperanza', artist: 'Sven Väth', year: '1993', label: 'Eye Q' },
    { title: 'Mahadeva', artist: 'Astral Projection', year: '1995', label: 'Trust in Trance' },
    { title: 'LSD', artist: 'Hallucinogen', year: '1995', label: 'Dragonfly' },
    { title: 'Gamemaster', artist: 'Lost Tribe', year: '1997', label: 'Hooj Choons' },
  ],
  'dub': [
    { title: 'Auffer', artist: 'Rhythm & Sound', year: '2003', label: 'Rhythm & Sound' },
    { title: 'Version Galore', artist: 'King Tubby & The Aggrovators', year: '1975', label: 'Jackpot' },
    { title: 'Satta Amassa Gana Dub', artist: 'The Abyssinians', year: '1976', label: 'Clinch' },
    { title: 'Victory', artist: 'Jah Shaka', year: '1984', label: 'Jah Shaka Music' },
    { title: 'Dub Syndicate — Pounding System', artist: 'Adrian Sherwood / On-U Sound', year: '1982', label: 'On-U Sound' },
    { title: 'Steppers Dub', artist: 'Iration Steppas', year: '1996', label: 'Subdub' },
  ],
  'roots-reggae': [
    { title: 'Fade Away', artist: 'Junior Byles', year: '1975', label: 'Channel One' },
    { title: 'Heart Made of Stone', artist: 'The Viceroys', year: '1980', label: 'Linval Thompson' },
    { title: 'Satta Massagana', artist: 'The Abyssinians', year: '1969', label: 'Studio One' },
    { title: 'Silly Games', artist: 'Janet Kay', year: '1979', label: 'Scope' },
    { title: 'Here I Come', artist: 'Barrington Levy', year: '1985', label: 'Time 1' },
    { title: 'Tempo', artist: 'Anthony Red Rose', year: '1985', label: 'Firehouse' },
  ],
  'hip-hop-boom-bap': [
    { title: 'Accordion', artist: 'Madvillain (MF DOOM & Madlib)', year: '2004', label: 'Stones Throw' },
    { title: 'Workinonit', artist: 'J Dilla', year: '2006', label: 'Stones Throw' },
    { title: '93 \'Til Infinity', artist: 'Souls of Mischief', year: '1993', label: 'Jive' },
    { title: 'Respiration', artist: 'Black Star (Mos Def & Talib Kweli)', year: '1998', label: 'Rawkus' },
    { title: 'Survival of the Fittest', artist: 'Mobb Deep', year: '1995', label: 'Loud' },
    { title: 'Feather', artist: 'Nujabes', year: '2005', label: 'Hydeout Productions' },
  ],
  'trap-cloud-rap-drill': [
    { title: 'Be Nice 2 Me', artist: 'Bladee', year: '2018', label: 'YEAR0001' },
    { title: 'location', artist: 'Playboi Carti (prod. Harry Fraud)', year: '2017', label: 'AWGE' },
    { title: 'Kennington Where It Started', artist: 'Harlem Spartans', year: '2017', label: 'HS' },
    { title: 'Calcium', artist: 'Ecco2k', year: '2019', label: 'YEAR0001' },
    { title: 'keep it G', artist: 'SpaceGhostPurrp', year: '2012', label: '4AD' },
    { title: 'Broke Boi', artist: 'Playboi Carti', year: '2015', label: 'Awful Records' },
  ],
  'grime': [
    { title: 'Eskimo', artist: 'Wiley', year: '2002', label: 'Wiley Kat' },
    { title: 'Morgue', artist: 'Wiley', year: '2003', label: 'White Label' },
    { title: 'Pied Piper', artist: 'Ruff Sqwad', year: '2005', label: 'No Hats No Hoods' },
    { title: 'Spartan', artist: 'Spooky Bizzle', year: '2010', label: 'Oil Gang' },
    { title: 'Buck', artist: 'Plastician', year: '2005', label: 'Terrorrhythm' },
    { title: 'Take Time', artist: 'Preditah', year: '2011', label: 'Earth616' },
  ],
  'jazz-spiritual-jazz-fusion': [
    { title: 'Journey in Satchidananda', artist: 'Alice Coltrane ft. Pharoah Sanders', year: '1971', label: 'Impulse!' },
    { title: 'Expansions', artist: 'Lonnie Liston Smith', year: '1975', label: 'Flying Dutchman' },
    { title: 'Places and Spaces', artist: 'Donald Byrd', year: '1975', label: 'Blue Note' },
    { title: 'Truth and Lies', artist: 'Kamaal Williams (Henry Wu)', year: '2018', label: 'Black Focus' },
    { title: 'Fyah', artist: 'Theon Cross', year: '2019', label: 'Gearbox' },
    { title: 'Strasbourg / St. Denis', artist: 'Roy Hargrove Quintet', year: '2008', label: 'EmArcy' },
  ],
  'soul-funk-boogie': [
    { title: 'I Can\'t Help It', artist: 'Michael Jackson (Stevie Wonder & Quincy Jones)', year: '1979', label: 'Epic' },
    { title: 'Don\'t Look Any Further', artist: 'Dennis Edwards', year: '1984', label: 'Gordy' },
    { title: 'SpottieOttieDopaliscious', artist: 'OutKast', year: '1998', label: 'LaFace' },
    { title: 'Inside My Love', artist: 'Minnie Riperton', year: '1975', label: 'Epic' },
    { title: 'You\'re the One for Me', artist: 'D. Train', year: '1981', label: 'Prelude' },
    { title: 'Untitled (How Does It Feel)', artist: 'D\'Angelo', year: '2000', label: 'Virgin' },
  ],
  'post-punk-coldwave-synth-pop': [
    { title: 'Warm Leatherette', artist: 'The Normal', year: '1978', label: 'Mute' },
    { title: 'la photographie', artist: 'Deux', year: '1983', label: 'Minimal Wave' },
    { title: 'cavity — first communion', artist: 'Christian Death', year: '1982', label: 'Frontier' },
    { title: 'Bela Lugosi\'s Dead', artist: 'Bauhaus', year: '1979', label: 'Small Wonder' },
    { title: 'Fade to Grey', artist: 'Visage', year: '1980', label: 'Polydor' },
    { title: 'She\'s in Parties', artist: 'Bauhaus', year: '1983', label: 'Beggars Banquet' },
  ],
  'krautrock-kosmische': [
    { title: 'Vitamin C', artist: 'CAN', year: '1972', label: 'United Artists' },
    { title: 'Halleluwah', artist: 'CAN', year: '1971', label: 'United Artists' },
    { title: 'negativland', artist: 'NEU!', year: '1972', label: 'Brain' },
    { title: 'zuckerzeit — Hollywood', artist: 'Cluster', year: '1974', label: 'Brain' },
    { title: 'Tanzmusik', artist: 'Harmonia', year: '1973', label: 'Brain' },
    { title: 'Rubycon Pt. 1', artist: 'Tangerine Dream', year: '1975', label: 'Virgin' },
  ],
  'alternative-indie-shoegaze': [
    { title: 'Only Shallow', artist: 'My Bloody Valentine', year: '1991', label: 'Creation' },
    { title: 'Heaven or Las Vegas', artist: 'Cocteau Twins', year: '1990', label: '4AD' },
    { title: 'Vapour Trail', artist: 'Ride', year: '1990', label: 'Creation' },
    { title: 'Good Morning, Captain', artist: 'Slint', year: '1991', label: 'Touch and Go' },
    { title: 'Svefn-g-englar', artist: 'Sigur Rós', year: '1999', label: 'FatCat' },
    { title: 'Katy Song', artist: 'Red House Painters', year: '1993', label: '4AD' },
  ],
  'afrobeat-global-groove': [
    { title: 'Gentleman', artist: 'Fela Kuti', year: '1973', label: 'EMI Nigeria' },
    { title: 'Atomic Bomb', artist: 'William Onyeabor', year: '1978', label: 'Wilfilms' },
    { title: 'Yegelle Tezeta', artist: 'Mulatu Astatke', year: '1970', label: 'Amha' },
    { title: 'Heaven', artist: 'Ebo Taylor', year: '1977', label: 'Essiebons' },
    { title: 'Sweet Mother', artist: 'Prince Nico Mbarga', year: '1976', label: 'Rogers All Stars' },
    { title: 'Space Echo', artist: 'Analog Africa Collective', year: '2016', label: 'Analog Africa' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2C. SPECIALIZED SUBGENRE, OFFSHOOT & ROOT NODES (FOR GENEALOGY & CONNECTIONS)
// ─────────────────────────────────────────────────────────────────────────────
// Guarantees that EVERY single genre chip under Historic Roots, Adjacent Genres,
// Offshoots & Subgenres, and Counter-Currents opens its own distinct, complete sheet!

const SPECIALIZED_SUBGENRE_NODES = {
  'hardgroove': {
    name: 'Hardgroove',
    parent: 'Detroit Techno',
    superGenre: 'Techno',
    secondarySuperGenre: 'House',
    originYear: 'Late 1990s – Early 2000s (Revival 2020s)',
    originPlace: 'UK, Benelux, Detroit & Global Club Circuit',
    bpmRange: '136–144 BPM',
    rhythmProfile: 'Fast, percussive, funk-sampled tribal and conga loops locked over driving 3-deck TR-909 techno kicks.',
    sonicTraits: ['Funk & Disco Loop Chops', 'Tribal Conga Drive', '3-Deck Tool Mixing', 'High-Energy Swing', '909 Ride Cymbals'],
    description: 'Coined and championed by Ben Sims, Mark Broom, and Dave Clarke in the late 1990s, Hardgroove fuses the relentless velocity of 3-deck Detroit and UK techno with short, infectious funk, Latin, and disco percussion loops. Experiencing a massive global resurgence in the 2020s, it prioritizes swinging, physical groove and turntablist dexterity over dark industrial minimalism.',
    parentGenres: ['Detroit Techno', 'Chicago House', 'Tribal House'],
    subgenres: ['Tribal Techno', 'Funky Techno', 'Schranz'],
    adjacentGenres: ['Hypnotic Techno', 'Tech House', 'Acid Techno'],
    backlashAgainst: ['Static Minimalism', 'Commercial EDM'],
    pioneerArtists: ['Ben Sims', 'Mark Broom', 'Dave Clarke', 'DJ Rush', 'Marco Bailey', 'Truncate', 'Stef Mendesidis', 'Marcal', 'Chlär', 'Alarico'],
    classicLabels: ['Hardgroove', 'Theory Recordings', 'Primate Recordings', 'Mutual Rytm', 'Symbolism', 'Pure Plastic'],
    eventContexts: ['Berghain (Berlin)', 'Vault Sessions (Amsterdam)', 'Fuse (Brussels)', 'Fabric (London)'],
    referenceTracks: [
      { title: 'Manipulated (Adam Beyer Remix)', artist: 'Ben Sims', year: '1999', label: 'Primate Recordings' },
      { title: ' Angie\'s Groove', artist: 'Mark Broom', year: '1996', label: 'Pure Plastic' },
      { title: 'Red 2 (Wisdom to the Wise)', artist: 'Dave Clarke', year: '1994', label: 'Bush' },
      { title: ' drum major', artist: 'Truncate', year: '2011', label: 'Truncate' },
    ],
    nicheTracks: [
      { title: 'Cybernetic', artist: 'Marcal', year: '2022', label: 'Enemy Records' },
      { title: 'Groove Tool 03', artist: 'Ben Sims', year: '2001', label: 'Hardgroove' },
      { title: 'Senzo', artist: 'Stef Mendesidis', year: '2019', label: 'Klockworks' },
      { title: 'Funky Ass', artist: 'Chlär', year: '2022', label: 'Mutual Rytm' },
    ],
  },
  'ambient-dub': {
    name: 'Ambient Dub',
    parent: 'Dub Techno',
    superGenre: 'Downtempo / Ambient',
    secondarySuperGenre: 'Jamaican / Reggae',
    originYear: 'Early 1990s (c. 1990–1994)',
    originPlace: 'Birmingham / London, UK & Berlin, Germany',
    bpmRange: '70–112 BPM',
    rhythmProfile: 'Slow-motion sub-bass meditations, beatless or half-time dubwise echoes, and oceanic environmental textures.',
    sonicTraits: ['Infinite Tape Feedback', 'Sub-Bass Drone', 'Beatless Space', 'Hydrophone Field Recordings', 'King Tubby Delay Matrix'],
    description: 'Coined by Birmingham\'s Beyond Records in 1992 and deepened by The Orb, Bill Laswell, Chain Reaction, and Echospace, Ambient Dub strips away the club 4/4 kick to let Jamaican dub\'s spatial architecture float in weightless ambient space. Sub-bass tremors, spring reverb splashes, and endless tape feedback loops turn the mixing desk into a meditative environmental instrument.',
    parentGenres: ['Dub', 'Ambient', 'Dub Techno'],
    subgenres: ['Illbient', 'Psydub', 'Drift Ambient'],
    adjacentGenres: ['Dub Techno', 'Ambient Techno', 'Downtempo'],
    backlashAgainst: ['High-Tempo Rave Fatigue'],
    pioneerArtists: ['The Orb', 'DeepChord', 'Rod Modell', 'Bill Laswell', 'Fluxion', 'Higher Intelligence Agency', 'Vladislav Delay', 'Deadbeat'],
    classicLabels: ['Beyond Records', 'Chain Reaction', 'Echospace [Detroit]', 'Silent Season', 'Axiom', 'FAX +49-69/450464'],
    eventContexts: ['Labyrinth Chill Tent', 'Atonal Berlin', 'Big Chill Festival (UK)'],
    referenceTracks: [
      { title: 'A Huge Ever Growing Pulsating Brain That Rules from the Centre of the Ultraworld', artist: 'The Orb', year: '1989', label: 'Wau! Mr. Modo' },
      { title: 'B1 (Biokinetics)', artist: 'Porter Ricks', year: '1996', label: 'Chain Reaction' },
      { title: 'Incense & Black Light', artist: 'Rod Modell', year: '2007', label: 'Windimoto' },
      { title: 'Multila', artist: 'Vladislav Delay', year: '2000', label: 'Chain Reaction' },
    ],
    nicheTracks: [
      { title: ' kettenreaktion', artist: 'Vainqueur', year: '1997', label: 'Chain Reaction' },
      { title: ' Campfire', artist: 'Silent Season Collective', year: '2012', label: 'Silent Season' },
      { title: 'Wilderness of North', artist: 'Deadbeat', year: '2002', label: ' ~scape' },
      { title: 'Colourform', artist: 'Higher Intelligence Agency', year: '1993', label: 'Beyond' },
    ],
  },
  'deep-techno': {
    name: 'Deep Techno',
    parent: 'Hypnotic Techno',
    superGenre: 'Techno',
    secondarySuperGenre: 'Downtempo / Ambient',
    originYear: 'Mid-2000s – Present',
    originPlace: 'Rome, Berlin, Stockholm & Tokyo',
    bpmRange: '122–130 BPM',
    rhythmProfile: 'Submerged, warm sub-bass grooves with organic polyrhythms, liquid pads, and subterranean atmospheric depth.',
    sonicTraits: ['Subterranean Sub-Bass', 'Liquid Pads', 'Shamanic Percussion', 'Warm Tape Saturation', 'Extended Introspection'],
    description: 'Championed by the Italian school (Donato Dozzy, Neel, Voices From The Lake, Luigi Tozzi, Claudio PRC, Dino Sabatini) alongside labels like Prologue, Hypnus, and Semantica, Deep Techno slows techno down into a warm, liquid, almost shamanic state. It blends the spatial depth of Dub Techno with organic polyrhythms and enveloping ambient pads.',
    parentGenres: ['Dub Techno', 'Hypnotic Techno', 'Ambient Techno'],
    subgenres: ['Shamanic Techno', 'Aquatic Techno', 'Subterranean Techno'],
    adjacentGenres: ['Hypnotic Techno', 'Dub Techno', 'Ambient', 'Minimal Techno'],
    backlashAgainst: ['Aggressive Hard Techno', 'Commercial Peak-Time Techno'],
    pioneerArtists: ['Donato Dozzy', 'Voices From The Lake', 'Luigi Tozzi', 'Claudio PRC', 'Neel', 'Dino Sabatini', 'Cio D\'Or', 'Ntogn', 'Ness'],
    classicLabels: ['Prologue', 'Hypnus Records', 'Semantica Records', 'The Gods Planet', 'Delsin', 'Mantis', 'Outis Music'],
    eventContexts: ['Labyrinth Festival (Japan)', 'Monument Festival (Norway)', 'Berghain Panorama / Halle', 'Parallel Festival'],
    referenceTracks: [
      { title: 'Involve', artist: 'Voices From The Lake', year: '2012', label: 'Prologue' },
      { title: 'Deep Blue', artist: 'Luigi Tozzi', year: '2016', label: 'Hypnus Records' },
      { title: 'Clear', artist: 'Claudio PRC', year: '2011', label: 'Prologue' },
      { title: 'Vaporware 07', artist: 'Donato Dozzy', year: '2008', label: 'Dozy' },
    ],
    nicheTracks: [
      { title: 'B2 (Mantis 01)', artist: 'Forest Drive West', year: '2020', label: 'Delsin — Mantis' },
      { title: 'Yggdrasil', artist: 'Ntogn', year: '2015', label: 'Hypnus Records' },
      { title: 'Phobos', artist: 'Ness', year: '2014', label: 'The Gods Planet' },
      { title: 'Shaman', artist: 'Dino Sabatini', year: '2012', label: 'Prologue' },
    ],
  },
  'modular-techno': {
    name: 'Modular Techno',
    parent: 'Hypnotic Techno',
    superGenre: 'Techno',
    originYear: '2000s – Present (Eurorack Era)',
    originPlace: 'Berlin, Birmingham, Madrid & Portland',
    bpmRange: '128–138 BPM',
    rhythmProfile: 'Generative, non-repeating CV/gate analog sequences, Buchla/Eurorack bleeps, and raw voltage-controlled percussion.',
    sonicTraits: ['Eurorack & Buchla Synthesis', 'Generative Sequences', 'FM Cross-Modulation', 'Live Hardware Improvisation', 'Sci-Fi Bleeps'],
    description: 'Driven by the Eurorack and Buchla modular synthesizer renaissance and pioneered in clubs by Surgeon, Blawan, Karenn, Steffi, Rrose, and Oscar Mulero, Modular Techno replaces static DAW loops with living, voltage-controlled patches. Every bar subtly mutates through cross-modulation, LFO drift, and analog wavefolding.',
    parentGenres: ['Hypnotic Techno', 'Detroit Techno', 'Industrial Techno'],
    subgenres: ['Live Hardware Techno', 'Sci-Fi Bleep Techno'],
    adjacentGenres: ['Hypnotic Techno', 'Industrial Techno', 'IDM / Braindance', 'Acid Techno'],
    backlashAgainst: ['Preset Laptop Techno'],
    pioneerArtists: ['Surgeon', 'Blawan', 'Karenn', 'Rrose', 'Oscar Mulero', 'Colin Benders', 'Steffi', 'Luke Slater', 'Speedy J'],
    classicLabels: ['Token', 'Voam', 'Warm Up Recordings', 'PoleGroup', 'Mord', 'Dynamic Tension', 'Stroboscopic Artefacts'],
    eventContexts: ['Superbooth (Berlin)', 'Berghain', 'Awakenings', 'Stoor Live (Speedy J)'],
    referenceTracks: [
      { title: 'Clean Skins', artist: 'Karenn (Blawan & Pariah)', year: '2012', label: 'Works The Long Nights' },
      { title: 'Generator', artist: 'Oscar Mulero', year: '2015', label: 'Warm Up' },
      { title: 'Radiance', artist: 'Surgeon', year: '2011', label: 'Dynamic Tension' },
      { title: 'Pentagon', artist: 'Rrose', year: '2013', label: 'Eaux' },
    ],
    nicheTracks: [
      { title: 'Crush on Me', artist: 'Karenn', year: '2019', label: 'Voam' },
      { title: 'Stoor Session 04', artist: 'Speedy J & Surgeon', year: '2021', label: 'Stoor' },
      { title: '999', artist: 'Blawan', year: '2018', label: 'Ternesc' },
      { title: 'Transmutation', artist: 'Stanislav Tolkachev', year: '2016', label: 'Semantica' },
    ],
  },
  'rominimal': {
    name: 'Rominimal',
    parent: 'Minimal Techno',
    superGenre: 'Techno',
    secondarySuperGenre: 'House',
    originYear: 'Mid-2000s (c. 2006–Present)',
    originPlace: 'Bucharest, Romania',
    bpmRange: '122–128 BPM',
    rhythmProfile: 'Intricate, elastic micro-percussion, rolling sub-basslines, and organic, classical/folk-tinged melodic fragments.',
    sonicTraits: ['Micro-Percussion', 'Rolling Sub-Bass', 'Afterhours Hypnosis', 'Vinyl-Only Culture', 'Extended 12-Hour Sets'],
    description: 'Born in Bucharest through the [a:rpia:r] trio (Rhadoo, Petre Inspirescu, Raresh) and inspired by Ricardo Villalobos, Rominimal evolved Minimal Techno and Microhouse into an intricate, deeply psychedelic afterhours art form defined by elastic sub-bass, subtle acoustic textures, and marathon sunrise sets at Sunwaves.',
    parentGenres: ['Minimal Techno', 'Deep House'],
    subgenres: ['Microhouse', 'Dub-Minimal'],
    adjacentGenres: ['Minimal Techno', 'Dub Techno', 'Tech House'],
    backlashAgainst: ['Mainstream Big-Room House'],
    pioneerArtists: ['Rhadoo', 'Petre Inspirescu', 'Raresh', '[a:rpia:r]', 'Barac', 'Priku', 'Cristi Cons', 'Vlad Caia', 'Cezar'],
    classicLabels: ['[a:rpia:r]', 'Understand', 'Sunrise', 'Amphia', 'Metereze', 'Perlon'],
    eventContexts: ['Sunwaves Festival (Mamaia)', 'Club Guesthouse (Bucharest)', 'Club Midi (Cluj)', 'Robert Johnson (Offenbach)'],
    referenceTracks: [
      { title: 'Point', artist: 'Rhadoo', year: '2011', label: '[a:rpia:r]' },
      { title: 'Sakadat', artist: 'Petre Inspirescu', year: '2007', label: '[a:rpia:r]' },
      { title: 'Moment', artist: 'Barac', year: '2014', label: 'Moment' },
      { title: 'B2 (a:rpia:r 01)', artist: '[a:rpia:r]', year: '2007', label: '[a:rpia:r]' },
    ],
    nicheTracks: [
      { title: 'Amphia 001', artist: 'Cristi Cons & Vlad Caia', year: '2012', label: 'Amphia' },
      { title: '2007', artist: 'Priku', year: '2015', label: 'Motif' },
      { title: 'Undeva', artist: 'Raresh', year: '2013', label: 'Metereze' },
      { title: 'Pahar', artist: 'Cezar', year: '2011', label: 'Understand' },
    ],
  },
  'soulful-house': {
    name: 'Soulful House',
    parent: 'Deep House',
    superGenre: 'House',
    secondarySuperGenre: 'Rhythm \'n\' Blues (R&B)',
    originYear: 'Late 1980s – 1990s',
    originPlace: 'New York, New Jersey & Chicago, USA',
    bpmRange: '118–125 BPM',
    rhythmProfile: 'Warm 4/4 garage-house swing with gospel vocals, live Fender Rhodes electric piano, horn sections, and upright/electric bass.',
    sonicTraits: ['Gospel & Soul Vocals', 'Fender Rhodes Chords', 'Paradise Garage Heritage', 'Live Horns & Percussion', 'Uplifting Spiritual Warmth'],
    description: 'Rooted in Larry Levan\'s Paradise Garage, Tony Humphries\'s Club Zanzibar in Newark ("Jersey Sound"), and Masters At Work ("Little" Louie Vega & Kenny "Dope" Gonzalez) in New York, Soulful & Garage House elevates house music with full-blooded gospel/R&B vocal performances, lush jazz-soul keyboard harmony, and live Latin/African percussion.',
    parentGenres: ['Deep House', 'Chicago House', 'Soul / Funk & Boogie'],
    subgenres: ['Garage House', 'Gospel House', 'Vocal House'],
    adjacentGenres: ['Deep House', 'Soul / Funk & Boogie', 'UK Garage / 2-Step', 'Jazz / Spiritual Jazz & Fusion'],
    backlashAgainst: ['Cold Instrumental Minimalism'],
    pioneerArtists: ['Masters At Work', 'Louie Vega', 'Kenny Dope', 'Kerri Chandler', 'Blaze', 'Tony Humphries', 'Larry Levan', 'Barbara Tucker', 'Osunlade', 'Joe Claussell'],
    classicLabels: ['Strictly Rhythm', 'Nervous Records', 'MAW Records', 'King Street Sounds', 'Ibadan', 'Spiritual Life Music', 'Yoruba Records'],
    eventContexts: ['Paradise Garage (NYC)', 'Club Zanzibar (Newark)', 'Body & SOUL (NYC)', 'The Shelter (NYC)'],
    referenceTracks: [
      { title: 'The Nervous Track', artist: 'Nuyorican Soul (Masters At Work)', year: '1993', label: 'Nervous Records' },
      { title: 'Atmosphere (Kerri\'s Foundation Dub)', artist: 'Kerri Chandler', year: '1993', label: 'Shelter' },
      { title: 'Lovelee Dae', artist: 'Blaze', year: '1997', label: 'Classic' },
      { title: 'I Get Deep', artist: 'Roland Clark', year: '2000', label: 'Shelter' },
    ],
    nicheTracks: [
      { title: 'Rain', artist: 'Kerri Chandler', year: '1998', label: 'Nervous' },
      { title: 'Je Ka Jo', artist: 'Joe Claussell', year: '1999', label: 'Spiritual Life' },
      { title: 'Momma\'s Groove', artist: 'Osunlade', year: '2007', label: 'Yoruba' },
      { title: 'gypsy woman (basement boyz strip to the bone)', artist: 'Crystal Waters', year: '1991', label: 'Mercury' },
    ],
  },
  'lo-fi-house': {
    name: 'Lo-Fi House',
    parent: 'Deep House',
    superGenre: 'House',
    originYear: 'Mid-2010s (c. 2014–2018)',
    originPlace: 'Internet / London, Vancouver, Melbourne & Berlin',
    bpmRange: '118–126 BPM',
    rhythmProfile: 'Tape-saturated, bit-crushed TR-909 drum machines, dusty jazz-house vocal loops, and melancholic VHS-era pads.',
    sonicTraits: ['Cassette Saturation', 'Overdriven 909 Hats', 'Melancholic Pads', 'Dusty Vocal Samples', 'DIY Internet Underground'],
    description: 'Emerging around 2014–2016 via underground YouTube channels and labels like Lobster Theremin, 1080p, and Shall Not Fade, Lo-Fi House pushed back against hyper-polished commercial club production by running classic 90s deep house and breakbeat tropes through cheap cassette decks, SP-404 samplers, and overdriven analog mixers.',
    parentGenres: ['Deep House', 'Chicago House', 'Ambient Techno'],
    subgenres: ['Outsider House', 'Mallsoft House'],
    adjacentGenres: ['Deep House', 'Dub Techno', 'Breakbeat'],
    backlashAgainst: ['Hyper-Polished Commercial EDM'],
    pioneerArtists: ['DJ Seinfeld', 'Mall Grab', 'Ross From Friends', 'DJ Boring', 'Baltra', 'Palms Trax', 'Huerco S.', 'Patricia'],
    classicLabels: ['Lobster Theremin', '1080p', 'Shall Not Fade', 'L.I.E.S.', 'Mood Hut', 'Opal Tapes'],
    eventContexts: ['Corsica Studios (London)', 'Phonox (London)', 'Horst Festival'],
    referenceTracks: [
      { title: 'Winona', artist: 'DJ Boring', year: '2016', label: 'E-Beamz' },
      { title: 'Talk to Me You\'ll Understand', artist: 'Ross From Friends', year: '2015', label: 'Breaker Breaker' },
      { title: 'U', artist: 'DJ Seinfeld', year: '2017', label: 'Lobster Fury' },
      { title: 'Can\'t (Get You Out of My Mind)', artist: 'Mall Grab', year: '2015', label: '1080p' },
    ],
    nicheTracks: [
      { title: 'Fade Away', artist: 'Baltra', year: '2015', label: 'IDMEMO' },
      { title: 'Equation', artist: 'Palms Trax', year: '2013', label: 'Lobster Theremin' },
      { title: 'For Those Of You Who Have Never (And Also Those Who Have)', artist: 'Huerco S.', year: '2016', label: 'Proibito' },
      { title: 'Spit', artist: 'legowelt', year: '2014', label: 'L.I.E.S.' },
    ],
  },
  'ragga-jungle': {
    name: 'Ragga Jungle',
    parent: 'Jungle',
    superGenre: 'Jungle / Drum \'n\' Bass',
    secondarySuperGenre: 'Jamaican / Reggae',
    originYear: 'Early 1990s (c. 1993–1995)',
    originPlace: 'London & Bristol, UK',
    bpmRange: '160–172 BPM',
    rhythmProfile: 'Hyper-chopped Amen and Think breakbeats paired with Jamaican Dancehall patois vocals, sound-clash sirens, and 808 sub-bass.',
    sonicTraits: ['Jamaican Sound System Patois', 'Amen Break Choppage', 'Dub Sirens & Rewinds', '808 Tearout Bass', 'Soundclash Culture'],
    description: 'The rawest intersection of Jamaican Dancehall sound-system culture and UK rave breakbeat science. Pioneered by Shy FX, UK Apachi, Remarc, Rebel MC (Congo Natty), and M-Beat between 1993 and 1995, Ragga Jungle pairs rapid-fire Jamaican MC toasting and sound-clash vocal plates with time-stretched Amen breaks and earth-shaking 808 sub-bass.',
    parentGenres: ['Jungle', 'Roots Reggae', 'Dub'],
    subgenres: ['Dubwise D&B', 'Raggacore'],
    adjacentGenres: ['Jungle', 'Drum \'n\' Bass', 'Breakbeat'],
    backlashAgainst: ['Sanitized Mainstream Dance'],
    pioneerArtists: ['Shy FX', 'UK Apachi', 'Congo Natty (Rebel MC)', 'Remarc', 'M-Beat', 'General Levy', 'Marvellous Cain', 'Krinjah'],
    classicLabels: ['SOUR', 'Suburban Base', 'Congo Natty', 'Kemet', 'Tearin\' Vinyl', 'White House'],
    eventContexts: ['Roast (London)', 'Telepathy', 'Rupture (Corsica Studios)', 'Notting Hill Carnival Sound Systems'],
    referenceTracks: [
      { title: 'Original Nuttah', artist: 'UK Apachi & Shy FX', year: '1994', label: 'SOUR' },
      { title: 'Incredible', artist: 'M-Beat ft. General Levy', year: '1994', label: 'Renk' },
      { title: 'R.I.P.', artist: 'Remarc', year: '1994', label: 'Suburban Base' },
      { title: 'The Hitman', artist: 'Marvellous Cain', year: '1994', label: 'IQ Records' },
    ],
    nicheTracks: [
      { title: 'Sound Murderer', artist: 'Remarc', year: '1994', label: 'White House' },
      { title: 'Junglist', artist: 'Tribe of Issachar ft. Peter Bouncer', year: '1996', label: 'Congo Natty' },
      { title: 'Limb By Limb (DJ SS Remix)', artist: 'Cutty Ranks', year: '1995', label: 'Suburban Base' },
      { title: 'Press The Trigger', artist: 'Kemet Crew', year: '1994', label: 'Kemet' },
    ],
  },
  'liquid-funk': {
    name: 'Liquid Funk',
    parent: 'Drum \'n\' Bass',
    superGenre: 'Jungle / Drum \'n\' Bass',
    secondarySuperGenre: 'Rhythm \'n\' Blues (R&B)',
    originYear: 'Late 1990s – 2000s (c. 1999–2005)',
    originPlace: 'London, Manchester, Dublin & São Paulo',
    bpmRange: '170–175 BPM',
    rhythmProfile: 'Rolling 2-step Drum \'n\' Bass breaks layered with Rhodes electric piano, jazz-soul samples, acoustic guitars, and warm sub-bass.',
    sonicTraits: ['Fender Rhodes & Jazz Chords', 'Soulful Vocal Hooks', 'Rolling Sub-Bass', 'Brazilian & Latin Influences', 'Warm Harmonic Flow'],
    description: 'Coined by Fabio on BBC Radio 1 around 1999–2000 and perfected by Calibre, Marcus Intalex & ST Files, High Contrast, Logistics, and Brazilian pioneers DJ Marky & XRS, Liquid Funk brought deep soul, jazz harmony, disco strings, and bossa nova warmth back into 174 BPM Drum \'n\' Bass.',
    parentGenres: ['Drum \'n\' Bass', 'Jungle', 'Soul / Funk & Boogie'],
    subgenres: ['Deep Liquid', 'Sambass', 'Atmospheric D&B'],
    adjacentGenres: ['Drum \'n\' Bass', 'Deep House', 'Jazz / Spiritual Jazz & Fusion'],
    backlashAgainst: ['Overly Aggressive Techstep'],
    pioneerArtists: ['Calibre', 'Marcus Intalex', 'High Contrast', 'Fabio', 'DJ Marky', 'Logistics', 'Nu:Tone', 'London Elektricity', 'Lenzman', 'Alix Perez'],
    classicLabels: ['Signature Recordings', 'Soul:r', 'Hospital Records', 'Creative Source', 'V Recordings', 'The North Quarter', '1985 Music'],
    eventContexts: ['Swerve at The End (London)', 'Hospitality (Heaven / Building Six)', 'Sun & Bass (Sardinia)'],
    referenceTracks: [
      { title: 'LK (Carolina Carol Bela)', artist: 'DJ Marky & XRS', year: '2002', label: 'V Recordings' },
      { title: 'Drop It Down', artist: 'Calibre ft. Singing Fats', year: '2004', label: 'Signature' },
      { title: 'Return of Forever', artist: 'High Contrast', year: '2002', label: 'Hospital' },
      { title: 'How You Make Me Feel', artist: 'Marcus Intalex & ST Files', year: '2000', label: '31 Records' },
    ],
    nicheTracks: [
      { title: 'Even If', artist: 'Calibre', year: '2010', label: 'Signature' },
      { title: 'Together', artist: 'Logistics', year: '2004', label: 'Hospital' },
      { title: '1984', artist: 'Alix Perez', year: '2009', label: 'Shogun Audio' },
      { title: 'Ever So Slightly', artist: 'Lenzman', year: '2010', label: 'Integral' },
    ],
  },
  'neurofunk': {
    name: 'Neurofunk',
    parent: 'Drum \'n\' Bass',
    superGenre: 'Jungle / Drum \'n\' Bass',
    secondarySuperGenre: 'Techno',
    originYear: 'Late 1990s (c. 1997–1999)',
    originPlace: 'London, UK & Rotterdam / Vienna',
    bpmRange: '172–176 BPM',
    rhythmProfile: 'Tightly funk-syncopated, razor-sharp 2-step drum programming paired with heavily resampled, morphing Reese basslines.',
    sonicTraits: ['Resampled Reese Bass', 'Z-Plane Filter Morphing', 'Sci-Fi Cyberpunk Atmosphere', 'Surgical Funk Drums'],
    description: 'Pioneered by Ed Rush & Optical on their landmark 1998 album "Wormhole" alongside Matrix, Konflict (Kemal & Rob Data), and later Noisia and Phace, Neurofunk evolved dark Techstep by injecting P-Funk bassline syncopation and E-mu Z-plane filter modulation into futuristic, cyberpunk sound design.',
    parentGenres: ['Drum \'n\' Bass', 'Techstep', 'Soul / Funk & Boogie'],
    subgenres: ['Minimal Neuro', 'Halftime Neuro'],
    adjacentGenres: ['Drum \'n\' Bass', 'Industrial Techno', 'IDM / Braindance'],
    backlashAgainst: ['Commercial Pop D&B'],
    pioneerArtists: ['Ed Rush & Optical', 'Konflict', 'Matrix', 'Noisia', 'Phace', 'Misanthrop', 'Black Sun Empire', 'Teebee', 'Calyx'],
    classicLabels: ['Virus Recordings', 'Renegade Hardware', 'Subtitles', 'Vision Recordings', 'Moving Shadow', 'Critical Music'],
    eventContexts: ['Renegade Hardware at The End (London)', 'Noisia Invites (Groningen)', 'Let It Roll (Prague)'],
    referenceTracks: [
      { title: 'Bacteria', artist: 'Ed Rush & Optical', year: '1999', label: 'Virus' },
      { title: 'Messiah', artist: 'Konflict', year: '2000', label: 'Renegade Hardware' },
      { title: 'The Tide', artist: 'Noisia', year: '2005', label: 'Vision' },
      { title: 'Mute \'98', artist: 'Matrix', year: '1998', label: 'Prototype' },
    ],
    nicheTracks: [
      { title: 'Medicine (Matrix Remix)', artist: 'Ed Rush & Optical', year: '1998', label: 'Virus' },
      { title: 'Beckoning', artist: 'Konflict', year: '2000', label: 'Renegade Hardware' },
      { title: 'Dead Limit', artist: 'Noisia & The Upbeats', year: '2015', label: 'Vision' },
      { title: 'Bioform', artist: 'Teebee', year: '2001', label: 'Subtitles' },
    ],
  },
  'house': {
    name: 'House',
    parent: 'Chicago House',
    superGenre: 'House',
    secondarySuperGenre: 'Rhythm \'n\' Blues (R&B)',
    originYear: 'Early 1980s (c. 1981–1986)',
    originPlace: 'Chicago, New York & Detroit, USA',
    bpmRange: '118–128 BPM',
    rhythmProfile: 'Four-on-the-floor kick drum, off-beat open hi-hats, swung 16th-note percussion, and soulful synth or acoustic basslines.',
    sonicTraits: ['Four-on-the-Floor Pulse', 'TR-909 / TR-808 / TR-707 Drums', 'Disco & Gospel Lineage', 'Soulful Chords & Vocals', 'Club Sanctuary Ethos'],
    description: 'Born in the early 1980s at Frankie Knuckles\'s Warehouse and Ron Hardy\'s Muzic Box in Chicago and parallel sanctuaries like Larry Levan\'s Paradise Garage in New York, House music transformed disco, gospel, boogie, and European synth-pop into the foundational 4/4 language of modern club culture. From raw machine tracks on Trax and DJ International to the jazz-infused depths of Deep House, Acid House, Soulful House, and Tech House, it remains a global vessel for liberation, groove, and communal joy.',
    parentGenres: ['Soul / Funk & Boogie', 'Disco', 'Electro'],
    subgenres: ['Deep House', 'Chicago House', 'Acid House', 'Tech House', 'Soulful House', 'Lo-Fi House'],
    adjacentGenres: ['Detroit Techno', 'UK Garage / 2-Step', 'Dub Techno', 'Breakbeat'],
    backlashAgainst: ['Anti-Disco Backlash', 'Commercial Mainstream Pop'],
    pioneerArtists: ['Frankie Knuckles', 'Larry Heard (Mr. Fingers)', 'Ron Hardy', 'Marshall Jefferson', 'Kerri Chandler', 'Masters At Work', 'Theo Parrish', 'Moodymann', 'Larry Levan', 'Lil Louis'],
    classicLabels: ['Trax Records', 'DJ International', 'Strictly Rhythm', 'Nervous Records', 'Sound Signature', 'Mahogani Music', 'Alleviated Records', 'Defected'],
    eventContexts: ['The Warehouse & The Muzic Box (Chicago)', 'Paradise Garage & The Loft (NYC)', 'Panorama Bar (Berlin)', 'Sub Club (Glasgow)'],
    referenceTracks: [
      { title: 'Your Love', artist: 'Frankie Knuckles / Jamie Principle', year: '1987', label: 'Trax Records' },
      { title: 'Can You Feel It', artist: 'Mr. Fingers (Larry Heard)', year: '1986', label: 'Trax Records' },
      { title: 'Move Your Body', artist: 'Marshall Jefferson', year: '1986', label: 'Trax Records' },
      { title: 'French Kiss', artist: 'Lil Louis', year: '1989', label: 'Diamond Records' },
      { title: 'Atmosphere (Kerri\'s Foundation Dub)', artist: 'Kerri Chandler', year: '1993', label: 'Shelter' },
    ],
    nicheTracks: [
      { title: 'Sharevari', artist: 'A Number of Names', year: '1981', label: 'Capriccio' },
      { title: 'No Way Back', artist: 'Adonis', year: '1986', label: 'Trax Records' },
      { title: '3 Chairs Theme', artist: '3 Chairs (Rick Wilhite, Marcellus Pittman, Theo Parrish, Moodymann)', year: '2004', label: 'Three Chairs' },
      { title: 'Deep Burnt', artist: 'Pepe Bradock', year: '1999', label: 'Kif Recordings' },
      { title: 'What U Do', artist: 'Motor City Drum Ensemble', year: '2008', label: 'MCDE' },
    ],
  },
  'techno': {
    name: 'Techno',
    parent: 'Detroit Techno',
    superGenre: 'Techno',
    secondarySuperGenre: 'Industrial & Gothic',
    originYear: 'Mid-1980s (c. 1985–1988)',
    originPlace: 'Detroit, USA → Berlin, Birmingham & Global',
    bpmRange: '126–142 BPM',
    rhythmProfile: 'Propulsive, machine-driven 4/4 or broken polyrhythmic pulse focused on timbral synthesis, tension-and-release, and futuristic sonic architecture.',
    sonicTraits: ['TR-909 & Modular Synthesis', 'Afrofuturist Machine Soul', 'Hypnotic Repetition', 'Subterranean Sub-Bass', 'Warehouse & Industrial Acoustics'],
    description: 'Forged in mid-1980s Detroit by The Belleville Three (Juan Atkins, Derrick May, Kevin Saunderson), Jeff Mills, Robert Hood, and Drexciya—who fused Parliament-Funkadelic\'s futurism with Kraftwerk, Electro, and Chicago track culture—Techno quickly became a global movement after the fall of the Berlin Wall. Spanning Detroit machine soul, Berlin\'s Dub and Hypnotic Techno continuum, Birmingham\'s Industrial Techno, and Minimal/Modular explorations, Techno treats the sound system as a portal into the future.',
    parentGenres: ['Electro', 'Chicago House', 'Krautrock / Kosmische'],
    subgenres: ['Detroit Techno', 'Dub Techno', 'Hypnotic Techno', 'Minimal Techno', 'Industrial Techno', 'Acid Techno', 'Hardgroove', 'Deep Techno'],
    adjacentGenres: ['Ambient Techno', 'IDM / Braindance', 'Tech House', 'UK Bass / Leftfield Bass'],
    backlashAgainst: ['Formulaic Pop Structures', 'Commercial Vocal Clichés'],
    pioneerArtists: ['Juan Atkins', 'Derrick May', 'Kevin Saunderson', 'Jeff Mills', 'Robert Hood', 'Basic Channel', 'Surgeon', 'Donato Dozzy', 'Richie Hawtin', 'Drexciya', 'Forest Drive West'],
    classicLabels: ['Transmat', 'Metroplex', 'Underground Resistance', 'Tresor', 'Basic Channel', 'Ostgut Ton', 'Axis', 'Plus 8', 'Ilian Tape', 'Delsin'],
    eventContexts: ['The Music Institute (Detroit)', 'Berghain / Panorama Bar (Berlin)', 'Tresor (Berlin)', 'Bassiani (Tbilisi)', 'De School / Dekmantel (Amsterdam)'],
    referenceTracks: [
      { title: 'Strings of Life', artist: 'Rhythim Is Rhythim (Derrick May)', year: '1987', label: 'Transmat' },
      { title: 'The Bells', artist: 'Jeff Mills', year: '1996', label: 'Purpose Maker' },
      { title: 'No UFO\'s', artist: 'Model 500 (Juan Atkins)', year: '1985', label: 'Metroplex' },
      { title: 'Phylyps Trak', artist: 'Basic Channel', year: '1993', label: 'Basic Channel' },
      { title: ' Knights of the Jaguar', artist: 'DJ Rolando (The Aztec Mystic)', year: '1999', label: 'Underground Resistance' },
    ],
    nicheTracks: [
      { title: 'System', artist: 'Forest Drive West', year: '2018', label: 'Livity Sound' },
      { title: 'Solitary', artist: 'Convextion', year: '2006', label: 'Down Low Music' },
      { title: 'Spirals', artist: 'Luigi Tozzi', year: '2016', label: 'Hypnus Records' },
      { title: 'Substrat', artist: 'Vainqueur', year: '1996', label: 'Chain Reaction' },
      { title: 'Bite', artist: 'Ancient Methods', year: '2007', label: 'Ancient Methods' },
    ],
  },
};

// Map normalized subgenre names to their specialized definition
const SPECIALIZED_BY_NORM = new Map();
for (const [slugKey, def] of Object.entries(SPECIALIZED_SUBGENRE_NODES)) {
  def.id = slugKey;
  SPECIALIZED_BY_NORM.set(_norm(def.name), def);
  SPECIALIZED_BY_NORM.set(slugKey, def);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ONTOLOGY RESOLVER, DYNAMIC SUBGENRE SYNTHESIZER & 50/50 TRACK SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given any raw genre/style string:
 * - When `options.forSheet === true` (used when opening a Genre Sheet or tapping any genre in Genealogy & Connections),
 *   if the input is a subgenre, offshoot, historic root, or counter-current that differs from a parent canonical node's
 *   exact name, it NEVER collapses into the parent node. Instead, it resolves to `SPECIALIZED_SUBGENRE_NODES` or
 *   synthesizes a rich, dedicated node for that exact genre with its own ID, description, genealogy, and 50/50 tracks.
 */
export function resolveGenreNode(rawGenreInput, options = {}) {
  const { forSheet = false } = options;
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

  const primaryToken = orderedTokens[0] || raw;
  const primaryNorm = _norm(primaryToken);

  // 1. Check if it's an EXACT canonical genre name in RAW_GENRE_NODES
  for (const node of RAW_GENRE_NODES) {
    if (_norm(node.name) === primaryNorm || node.id === _slug(primaryToken)) {
      return node;
    }
  }

  // 2. Check our dedicated SPECIALIZED_SUBGENRE_NODES ontology
  if (SPECIALIZED_BY_NORM.has(primaryNorm) || SPECIALIZED_BY_NORM.has(_slug(primaryToken))) {
    const spec = SPECIALIZED_BY_NORM.get(primaryNorm) || SPECIALIZED_BY_NORM.get(_slug(primaryToken));
    const parentNode = ALIAS_TO_CANONICAL.get(_norm(spec.parent || '')) || RAW_GENRE_NODES[0];
    return {
      ...parentNode,
      ...spec,
      id: spec.id || _slug(spec.name),
    };
  }

  // 3. Find closest parent canonical node via ALIAS_TO_CANONICAL or STYLE_SYNONYM_MAP
  let matchedParentNode = null;
  for (const tok of orderedTokens) {
    const n = _norm(tok);
    if (ALIAS_TO_CANONICAL.has(n)) {
      matchedParentNode = ALIAS_TO_CANONICAL.get(n);
      break;
    }
    if (STYLE_SYNONYM_MAP[n]) {
      const targetName = STYLE_SYNONYM_MAP[n];
      const found = ALIAS_TO_CANONICAL.get(_norm(targetName));
      if (found) {
        matchedParentNode = found;
        break;
      }
    }
    const matchingKey = Object.keys(STYLE_SYNONYM_MAP)
      .sort((a, b) => b.length - a.length)
      .find(k => k.length >= 4 && n.includes(k));
    if (matchingKey) {
      const found = ALIAS_TO_CANONICAL.get(_norm(STYLE_SYNONYM_MAP[matchingKey]));
      if (found) {
        matchedParentNode = found;
        break;
      }
    }
  }

  //Also check if any canonical node references `primaryToken` in its subgenres, parentGenres, adjacentGenres, or backlashAgainst
  if (!matchedParentNode) {
    for (const node of RAW_GENRE_NODES) {
      const allRel = [
        ...(node.subgenres || []),
        ...(node.parentGenres || []),
        ...(node.adjacentGenres || []),
        ...(node.backlashAgainst || []),
        ...(node.influences || []),
      ].map(_norm);
      if (allRel.includes(primaryNorm) || _norm(node.superGenre) === primaryNorm) {
        matchedParentNode = node;
        break;
      }
    }
  }

  // If NOT opening a specific subgenre sheet (e.g., track classification) and we found a canonical node, return it
  if (!forSheet && matchedParentNode) {
    return matchedParentNode;
  }

  // 4. When `forSheet === true` (or no canonical match): if `primaryToken` is a distinct subgenre/offshoot/root/super-genre
  // (e.g. "Ambient Dub Techno", "Detroit Second Wave", "Techstep", "House", "Techno", "Disco", "Drumfunk", "Autonomic"),
  // synthesize a dedicated, complete Genre Sheet node specifically for `primaryToken` so the sheet ALWAYS updates!
  const baseNode = matchedParentNode || GENRE_BY_ID.get('hypnotic-techno') || RAW_GENRE_NODES[0];
  if (_norm(baseNode.name) === primaryNorm) {
    return baseNode;
  }

  const displayTitle = primaryToken;
  const slugId = _slug(displayTitle);
  const parentPoolClassics = [
    ...(baseNode.referenceTracks || []),
    ...(EXTENDED_CLASSIC_TRACKS[baseNode.id] || []),
  ];
  const parentPoolNiche = [
    ...(DEEP_NICHE_TRACKS[baseNode.id] || []),
  ];

  // Deterministic rotation based on slugId so each subgenre starts with a distinct slice of tracks
  const hash = slugId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const rotateArr = (arr, shift) => {
    if (!arr || !arr.length) return [];
    const s = shift % arr.length;
    return [...arr.slice(s), ...arr.slice(0, s)];
  };

  return {
    ...baseNode,
    id: slugId,
    name: displayTitle,
    aliases: [baseNode.name, ...(baseNode.aliases || []).filter(a => _norm(a) !== primaryNorm).slice(0, 2)],
    siblingGroup: `${displayTitle} & ${baseNode.name}`,
    description: `${displayTitle} is a vital stylistic movement within the ${baseNode.superGenre || 'Electronic'} continuum closely linked to ${baseNode.name} (${baseNode.originPlace || 'Global Underground'}, ${baseNode.originYear || '1990s–Present'}). Defined by ${baseNode.rhythmProfile ? baseNode.rhythmProfile.charAt(0).toLowerCase() + baseNode.rhythmProfile.slice(1) : 'distinctive rhythmic and timbral architecture'}, ${displayTitle} carved out its own dedicated sonic identity through specialized independent imprints (${(baseNode.classicLabels || []).slice(0, 4).join(', ')}), pioneering selectors (${(baseNode.pioneerArtists || []).slice(0, 4).join(', ')}), and underground sound systems.`,
    parentGenres: [baseNode.name, ...(baseNode.parentGenres || []).filter(g => _norm(g) !== primaryNorm).slice(0, 3)],
    subgenres: (baseNode.subgenres || []).filter(g => _norm(g) !== primaryNorm).concat(baseNode.adjacentGenres?.slice(0, 2) || []).slice(0, 4),
    adjacentGenres: [baseNode.name, ...(baseNode.adjacentGenres || []).filter(g => _norm(g) !== primaryNorm).slice(0, 4)],
    referenceTracks: rotateArr(parentPoolClassics, hash),
    nicheTracks: rotateArr(parentPoolNiche, hash + 2),
  };
}

/**
 * Generates a deterministic vinyl sleeve SVG data URI so a genre track never appears blank
 * even before live provider / iTunes artwork finishes resolving.
 */
export function buildGenreSleeveDataUri(item = {}, genreName = '') {
  const seedStr = `${item.artist || ''}-${item.title || ''}-${genreName || ''}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const abs = Math.abs(hash);
  const hue1 = abs % 360;
  const hue2 = (hue1 + 42 + (abs % 55)) % 360;
  const initials = String(item.artist || item.title || genreName || 'KY')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => (w[0] || '').toUpperCase())
    .join('') || 'KY';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="hsl(${hue1},48%,22%)"/>` +
    `<stop offset="100%" stop-color="hsl(${hue2},62%,10%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="300" height="300" fill="url(#g)"/>` +
    `<circle cx="150" cy="150" r="112" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>` +
    `<circle cx="150" cy="150" r="82" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>` +
    `<circle cx="150" cy="150" r="44" fill="hsl(${hue1},58%,32%)" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>` +
    `<circle cx="150" cy="150" r="9" fill="#0d0d11"/>` +
    `<text x="150" y="268" text-anchor="middle" fill="rgba(255,255,255,0.55)" font-family="-apple-system,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="2">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getDefaultProviderPriority() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('providerPriority') || localStorage.getItem('kyoyu-provider-priority');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(p => String(p).toLowerCase());
      }
    }
  } catch (e) {}
  return ['bandcamp', 'soundcloud', 'youtube', 'discogs', 'spotify', 'applemusic', 'tidal'];
}

/**
 * Assigns and orders tracks according to the user's provider ranking in Settings.
 * If a curated track has `resolve:` URL (playable across providers), its provider is assigned
 * proportionally to the user's top ranked providers (e.g. mostly #1 Bandcamp, then #2 SoundCloud, etc.),
 * and all tracks in the section are sorted by the user's provider priority ranking.
 */
export function orderTracksByProviderPriority(tracks = [], priorityInput = []) {
  const priority = (Array.isArray(priorityInput) && priorityInput.length > 0)
    ? priorityInput.map(p => String(p).toLowerCase())
    : getDefaultProviderPriority();

  const playableRankOrder = priority.filter(p => ['bandcamp', 'soundcloud', 'youtube', 'spotify', 'applemusic', 'tidal', 'discogs'].includes(p));
  const primaryProv = playableRankOrder[0] || 'bandcamp';
  const secondaryProv = playableRankOrder[1] || 'soundcloud';
  const tertiaryProv = playableRankOrder[2] || 'youtube';

  const rankOf = (prov) => {
    const p = String(prov || '').toLowerCase();
    const idx = priority.indexOf(p);
    return idx === -1 ? 999 : idx;
  };

  const assigned = tracks.map((t, idx) => {
    const rawUrl = String(t.trackUrl || t.url || '');
    const isResolve = rawUrl.startsWith('resolve:');
    let prov = String(t.provider || '').toLowerCase();
    // For unresolved ontology tracks that will be resolved on playback or enrichment,
    // weight their target provider toward the user's Settings ranking (#1 mostly, then #2, then #3)
    if (isResolve && (!prov || prov === 'discogs')) {
      const mod = idx % 10;
      if (mod < 6) prov = primaryProv;
      else if (mod < 9) prov = secondaryProv;
      else prov = tertiaryProv;
    }
    return {
      ...t,
      provider: prov || primaryProv,
    };
  });

  return assigned.sort((a, b) => {
    const ra = rankOf(a.provider);
    const rb = rankOf(b.provider);
    if (ra !== rb) return ra - rb;
    // Prefer tracks with real external artwork URLs over data: URI fallbacks within the same provider tier
    const aRealArt = a.coverImage && !String(a.coverImage).startsWith('data:') ? 0 : 1;
    const bRealArt = b.coverImage && !String(b.coverImage).startsWith('data:') ? 0 : 1;
    return aRealArt - bRealArt;
  });
}

/**
 * Builds the 3 Genre Sheet release sections (10 titles each):
 * 1. `essentialClassics` (10 titles) — foundational classics of the genre
 * 2. `nicheCuts` (10 titles) — strictly niche underground cuts (likes <= 1000 & artist followers <= 1000)
 * 3. `recommendations` (10 titles) — the sweet spot between classics & niche cuts, matching 100% the genre
 *    and the initial context track/artist/label + public/platform playlists.
 */
export function selectGenreThreeSections(
  nodeInput,
  externalPools = {},
  context = {},
  seeds = {},
  providerPriorityInput = []
) {
  const node = typeof nodeInput === 'string' ? resolveGenreNode(nodeInput, { forSheet: true }) : (nodeInput || RAW_GENRE_NODES[0]);
  const baseId = GENRE_BY_ID.has(node.id) ? node.id : (_slug(node.parent || '') || _slug(node.parentGenres?.[0] || '') || 'hypnotic-techno');
  const priority = (Array.isArray(providerPriorityInput) && providerPriorityInput.length > 0)
    ? providerPriorityInput
    : getDefaultProviderPriority();

  const classicSeed = typeof seeds === 'number' ? seeds : (seeds.essentialClassics ?? seeds.all ?? 0);
  const nicheSeed = typeof seeds === 'number' ? seeds : (seeds.nicheCuts ?? seeds.all ?? 0);
  const recSeed = typeof seeds === 'number' ? seeds : (seeds.recommendations ?? seeds.all ?? 0);

  // Gather related genre IDs for deep pool expansion so every section has >= 25 candidates for refreshing
  const relatedIds = [];
  for (const relName of [...(node.subgenres || []), ...(node.parentGenres || []), ...(node.adjacentGenres || [])]) {
    const rSlug = _slug(relName);
    if (EXTENDED_CLASSIC_TRACKS[rSlug] || DEEP_NICHE_TRACKS[rSlug] || GENRE_BY_ID.has(rSlug)) {
      if (!relatedIds.includes(rSlug) && rSlug !== node.id && rSlug !== baseId) {
        relatedIds.push(rSlug);
      }
    }
  }

  const relatedClassics = [];
  const relatedNiche = [];
  for (const rId of relatedIds) {
    const rNode = GENRE_BY_ID.get(rId);
    if (rNode?.referenceTracks) relatedClassics.push(...rNode.referenceTracks);
    if (EXTENDED_CLASSIC_TRACKS[rId]) relatedClassics.push(...EXTENDED_CLASSIC_TRACKS[rId]);
    if (rNode?.nicheTracks) relatedNiche.push(...rNode.nicheTracks);
    if (DEEP_NICHE_TRACKS[rId]) relatedNiche.push(...DEEP_NICHE_TRACKS[rId]);
  }

  // Normalize external pools (supports array or { classics, niche, recommendations })
  let extClassics = [];
  let extNiche = [];
  let extRecommendations = [];
  if (Array.isArray(externalPools)) {
    for (const ext of externalPools) {
      if (!ext || !ext.title) continue;
      const likes = Number(ext.likesCount || 0);
      const followers = Number(ext.userFollowersCount || 0);
      const yr = parseInt(ext.year, 10);
      if (likes <= 1000 && followers <= 1000 && (ext.provider === 'bandcamp' || ext.provider === 'soundcloud' || (yr && yr >= 2012))) {
        extNiche.push(ext);
      } else if (yr && yr <= 2005) {
        extClassics.push(ext);
      } else {
        extRecommendations.push(ext);
      }
    }
  } else if (externalPools && typeof externalPools === 'object') {
    extClassics = Array.isArray(externalPools.classics) ? externalPools.classics : [];
    extNiche = Array.isArray(externalPools.niche) ? externalPools.niche : [];
    extRecommendations = Array.isArray(externalPools.recommendations) ? externalPools.recommendations : [];
  }

  const normalizeTrackItem = (item, sectionKey, idx, seedVal) => {
    const rawLabel = item.label
      ? String(item.label).replace(/^(Essential Classic|Deep Cut|Niche Cut|Recommendation)\s*·\s*/i, '').trim()
      : '';
    const fallbackCover = buildGenreSleeveDataUri(item, node.name);
    const realCover = (item.coverImage && !String(item.coverImage).includes('spacer.gif'))
      ? item.coverImage
      : ((item.thumb && !String(item.thumb).includes('spacer.gif')) ? item.thumb : (item.cover || ''));
    const coverUrl = realCover || fallbackCover;
    return {
      id: item.id || `genre-${sectionKey}-${node.id}-${idx}-${seedVal}`,
      discogsId: item.discogsId ? String(item.discogsId) : '',
      title: String(item.title || '').trim(),
      artist: String(item.artist || item.artistName || '').replace(/\s*\(\d+\)\s*$/, '').trim(),
      label: rawLabel || node.name,
      year: item.year ? String(item.year) : '',
      trackUrl: item.trackUrl || item.url || `resolve:${item.artist || ''} ${item.title || ''}`.trim(),
      url: item.url || item.trackUrl || `resolve:${item.artist || ''} ${item.title || ''}`.trim(),
      coverImage: coverUrl,
      thumb: item.thumb && !String(item.thumb).includes('spacer.gif') ? item.thumb : coverUrl,
      provider: item.provider || priority[0] || 'bandcamp',
      type: item.type || 'release',
      likesCount: item.likesCount != null ? Number(item.likesCount) : null,
      userFollowersCount: item.userFollowersCount != null ? Number(item.userFollowersCount) : null,
    };
  };

  const dedupeList = (list, sectionKey, seedVal, filterFn = null) => {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || !item.title) continue;
      if (filterFn && !filterFn(item)) continue;
      const key = `${_norm(item.artist || item.artistName || '')}|${_norm(item.title || '')}`;
      if (!key || key === '|' || seen.has(key)) continue;
      seen.add(key);
      out.push(normalizeTrackItem(item, sectionKey, i, seedVal));
    }
    return out;
  };

  // 1. ESSENTIAL CLASSICS POOL (Foundational classics of the genre)
  const rawClassicsPool = [
    ...extClassics,
    ...(node.referenceTracks || []),
    ...(EXTENDED_CLASSIC_TRACKS[node.id] || []),
    ...(EXTENDED_CLASSIC_TRACKS[baseId] || []),
    ...relatedClassics,
  ];
  const classicsPool = dedupeList(rawClassicsPool, 'classic', classicSeed);

  // 2. NICHE CUTS POOL (Strictly likesCount <= 1000 AND userFollowersCount <= 1000)
  const isNicheEligible = (item) => {
    const likes = item.likesCount != null ? Number(item.likesCount) : 0;
    const followers = item.userFollowersCount != null ? Number(item.userFollowersCount) : 0;
    const haveCount = item.have != null ? Number(item.have) : 0;
    return likes <= 1000 && followers <= 1000 && haveCount <= 1000;
  };
  const rawNichePool = [
    ...extNiche,
    ...(node.nicheTracks || []),
    ...(DEEP_NICHE_TRACKS[node.id] || []),
    ...(DEEP_NICHE_TRACKS[baseId] || []),
    ...relatedNiche,
  ];
  const nichePool = dedupeList(rawNichePool, 'niche', nicheSeed, isNicheEligible);

  // Rotate helper to select 10 items per section
  const pickTenRotated = (pool, count, seedVal, excludeKeys = new Set()) => {
    const filtered = pool.filter(item => {
      const k = `${_norm(item.artist)}|${_norm(item.title)}`;
      return !excludeKeys.has(k);
    });
    const source = filtered.length >= count ? filtered : pool;
    if (!source.length) return [];
    const picked = [];
    const stride = (seedVal * 5) % source.length;
    for (let i = 0; i < Math.min(count, source.length); i++) {
      picked.push(source[(stride + i) % source.length]);
    }
    return orderTracksByProviderPriority(picked, priority);
  };

  const essentialClassics = pickTenRotated(classicsPool, 10, classicSeed);
  const usedInClassics = new Set(essentialClassics.map(t => `${_norm(t.artist)}|${_norm(t.title)}`));

  const nicheCuts = pickTenRotated(nichePool, 10, nicheSeed, usedInClassics);
  const usedInClassicsAndNiche = new Set([
    ...usedInClassics,
    ...nicheCuts.map(t => `${_norm(t.artist)}|${_norm(t.title)}`),
  ]);

  // 3. RECOMMENDATIONS POOL (Sweet spot between Essential Classics & Niche Cuts,
  // matching 100% the genre + initial context track/artist/label + public/platform playlists)
  const ctxArtistNorm = _norm(context.artist || '');
  const ctxLabelNorm = _norm(context.label || '');
  const ctxTitleNorm = _norm(context.title || '');

  // Build bridge candidates from remaining genre classics + niche cuts + pioneer/label tracks
  const bridgeCandidates = [];
  const maxBridge = Math.max(classicsPool.length, nichePool.length);
  for (let i = 0; i < maxBridge; i++) {
    if (i < classicsPool.length) bridgeCandidates.push(classicsPool[i]);
    if (i < nichePool.length) bridgeCandidates.push(nichePool[i]);
  }

  const rawRecsPool = [
    ...extRecommendations,
    ...bridgeCandidates,
  ];

  // Score recommendations by affinity to the context track/artist/label, playlist provenance, and genre match
  const dedupedRecs = dedupeList(rawRecsPool, 'rec', recSeed, (item) => {
    if (ctxTitleNorm && _norm(item.title) === ctxTitleNorm && (!ctxArtistNorm || _norm(item.artist) === ctxArtistNorm)) {
      return false; // Don't recommend the exact same track the user is already on
    }
    return true;
  });

  const scoredRecs = dedupedRecs.map((item, idx) => {
    let score = 50;
    const aNorm = _norm(item.artist);
    const lNorm = _norm(item.label);
    if (ctxArtistNorm && (aNorm === ctxArtistNorm || aNorm.includes(ctxArtistNorm))) score += 35;
    if (ctxLabelNorm && lNorm && (lNorm === ctxLabelNorm || lNorm.includes(ctxLabelNorm))) score += 30;
    if ((node.pioneerArtists || []).some(p => _norm(p) === aNorm)) score += 20;
    if ((node.classicLabels || []).some(l => _norm(l) === lNorm)) score += 18;
    if (item.fromPlaylist) score += 28;
    if (item.coverImage && !String(item.coverImage).startsWith('data:')) score += 12;
    // Slight deterministic offset based on recSeed so refreshing surfaces fresh top recommendations
    const rotatedIdx = (idx + recSeed * 7) % Math.max(1, dedupedRecs.length);
    score += Math.max(0, 15 - rotatedIdx * 0.5);
    return { item, score };
  });

  scoredRecs.sort((a, b) => b.score - a.score);
  const orderedRecPool = scoredRecs.map(s => s.item);
  const recommendations = pickTenRotated(orderedRecPool, 10, recSeed, usedInClassicsAndNiche);

  return {
    essentialClassics,
    nicheCuts,
    recommendations,
    similarTracks: [...essentialClassics.slice(0, 5), ...nicheCuts.slice(0, 5)],
  };
}

/**
 * Selects a balanced 50% Essential Classics / 50% Deep Niche Cuts list of tracks for a genre,
 * rotating through the pools whenever `refreshSeed` increments so the user can refresh suggestions endlessly.
 */
export function select5050GenreTracks(nodeInput, externalTracks = [], refreshSeed = 0) {
  const sections = selectGenreThreeSections(nodeInput, externalTracks, {}, refreshSeed);
  const interleaved = [];
  const maxLen = Math.max(sections.essentialClassics.length, sections.nicheCuts.length);
  for (let i = 0; i < Math.min(5, maxLen); i++) {
    if (i < sections.essentialClassics.length) interleaved.push(sections.essentialClassics[i]);
    if (i < sections.nicheCuts.length) interleaved.push(sections.nicheCuts[i]);
  }
  return interleaved;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3B. GENRE-AWARE SEARCH ENGINE MATCHER (FOR SEARCH PAGE)
// ─────────────────────────────────────────────────────────────────────────────

const SUPER_GENRE_DEFAULTS = {
  'house': {
    primary: 'House',
    related: ['Deep House', 'Chicago House', 'Acid House', 'Tech House'],
  },
  'techno': {
    primary: 'Techno',
    related: ['Detroit Techno', 'Dub Techno', 'Hypnotic Techno', 'Minimal Techno'],
  },
  'bass': {
    primary: 'UK Bass / Leftfield Bass',
    related: ['Dubstep', 'UK Garage / 2-Step', 'Jungle', 'Drum \'n\' Bass'],
  },
  'dnb': {
    primary: 'Drum \'n\' Bass',
    related: ['Jungle', 'Liquid Funk', 'Neurofunk', 'Breakbeat'],
  },
  'drum and bass': {
    primary: 'Drum \'n\' Bass',
    related: ['Jungle', 'Liquid Funk', 'Neurofunk', 'Breakbeat'],
  },
  'drum & bass': {
    primary: 'Drum \'n\' Bass',
    related: ['Jungle', 'Liquid Funk', 'Neurofunk', 'Breakbeat'],
  },
  'reggae': {
    primary: 'Roots Reggae',
    related: ['Dub', 'Ambient Dub', 'Ragga Jungle', 'Dub Techno'],
  },
  'jazz': {
    primary: 'Jazz / Spiritual Jazz & Fusion',
    related: ['Deep House', 'Soul / Funk & Boogie', 'Hip Hop / Boom Bap', 'Afrobeat & Global Groove'],
  },
  'funk': {
    primary: 'Soul / Funk & Boogie',
    related: ['Chicago House', 'Electro', 'Afrobeat & Global Groove', 'Deep House'],
  },
  'soul': {
    primary: 'Soul / Funk & Boogie',
    related: ['Soulful House', 'Deep House', 'Jazz / Spiritual Jazz & Fusion', 'Hip Hop / Boom Bap'],
  },
  'disco': {
    primary: 'Soul / Funk & Boogie',
    related: ['Chicago House', 'Deep House', 'Soulful House', 'Electro'],
  },
  'rock': {
    primary: 'Alternative / Indie & Shoegaze',
    related: ['Krautrock / Kosmische', 'Post-Punk / Coldwave & Synth-Pop', 'Ambient', 'Downtempo'],
  },
  'indie': {
    primary: 'Alternative / Indie & Shoegaze',
    related: ['Post-Punk / Coldwave & Synth-Pop', 'Krautrock / Kosmische', 'Downtempo', 'Lo-Fi House'],
  },
};

/**
 * Detects if a search query in `Search.jsx` is searching for a genre.
 * Returns null if the query is not a genre query, OR returns:
 * - `primaryGenre`: Full Genre Node for the #1 pinned Genre result
 * - `relatedGenres`: Array of 4 related Genre Nodes for results #2–#5
 * - `curatedTracks`: Playable 50% Classic / 50% Niche tracks for this genre
 * - `curatedArtists`: Representative artists of this genre
 * - `curatedLabels`: Representative labels of this genre
 */
export function matchGenreSearchQuery(rawQuery) {
  const q = _norm(rawQuery);
  if (!q || q.length < 3) return null;

  let primaryNode = null;
  let explicitRelatedNames = null;

  // 1. Check Super-Genre umbrella terms ("house", "techno", "bass", "dnb", "jazz", etc.)
  if (SUPER_GENRE_DEFAULTS[q]) {
    const def = SUPER_GENRE_DEFAULTS[q];
    primaryNode = resolveGenreNode(def.primary, { forSheet: true });
    explicitRelatedNames = def.related;
  }

  // 2. Check exact match in canonical nodes, aliases, specialized subgenres, or STYLE_SYNONYM_MAP
  if (!primaryNode) {
    for (const node of RAW_GENRE_NODES) {
      if (_norm(node.name) === q || (node.aliases || []).some(a => _norm(a) === q)) {
        primaryNode = resolveGenreNode(q, { forSheet: true });
        break;
      }
    }
  }
  if (!primaryNode && SPECIALIZED_BY_NORM.has(q)) {
    primaryNode = resolveGenreNode(q, { forSheet: true });
  }
  if (!primaryNode && STYLE_SYNONYM_MAP[q]) {
    primaryNode = resolveGenreNode(q, { forSheet: true });
  }

  // 3. Check if query matches any subgenre / offshoot in any canonical node
  if (!primaryNode) {
    for (const node of RAW_GENRE_NODES) {
      const matchSub = [...(node.subgenres || []), ...(node.adjacentGenres || [])].find(s => _norm(s) === q);
      if (matchSub) {
        primaryNode = resolveGenreNode(matchSub, { forSheet: true });
        break;
      }
    }
  }

  // 4. Unambiguous prefix match for well-known genre queries (e.g. "dub tech", "uk gar", "deep ho", "minima", "kraut")
  if (!primaryNode && q.length >= 4) {
    for (const node of RAW_GENRE_NODES) {
      if (_norm(node.name).startsWith(q)) {
        primaryNode = node;
        break;
      }
    }
    if (!primaryNode) {
      const synKey = Object.keys(STYLE_SYNONYM_MAP).find(k => k.length >= 5 && k.startsWith(q));
      if (synKey) {
        primaryNode = resolveGenreNode(synKey, { forSheet: true });
      }
    }
  }

  if (!primaryNode) return null;

  // Build the 4 related genres (deduplicated and distinct from primaryNode)
  const candidateRelatedNames = [
    ...(explicitRelatedNames || []),
    ...(primaryNode.subgenres || []),
    ...(primaryNode.adjacentGenres || []),
    ...(primaryNode.parentGenres || []),
  ];

  const relatedGenres = [];
  const seenGenreNorms = new Set([_norm(primaryNode.name)]);
  for (const rName of candidateRelatedNames) {
    const rn = _norm(rName);
    if (!rn || seenGenreNorms.has(rn)) continue;
    seenGenreNorms.add(rn);
    const rNode = resolveGenreNode(rName, { forSheet: true });
    if (rNode && !seenGenreNorms.has(_norm(rNode.name)) || rNode.name === rName) {
      seenGenreNorms.add(_norm(rNode.name));
      relatedGenres.push(rNode);
      if (relatedGenres.length >= 4) break;
    }
  }

  // Ensure we always have exactly 4 related genres
  if (relatedGenres.length < 4) {
    for (const fallbackNode of RAW_GENRE_NODES) {
      if (!seenGenreNorms.has(_norm(fallbackNode.name))) {
        seenGenreNorms.add(_norm(fallbackNode.name));
        relatedGenres.push(fallbackNode);
        if (relatedGenres.length >= 4) break;
      }
    }
  }

  const tracks = select5050GenreTracks(primaryNode, [], 0);
  return {
    matchedQuery: rawQuery,
    primaryGenre: primaryNode,
    relatedGenres: relatedGenres.slice(0, 4),
    curatedTracks: tracks,
    curatedArtists: (primaryNode.pioneerArtists || []).slice(0, 12),
    curatedLabels: (primaryNode.classicLabels || []).slice(0, 12),
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
 * combining the canonical/specialized Musicmap ontology node with contextual connections
 * and a balanced 50% Essential Classics / 50% Deep Niche Cuts track list.
 */
export function buildInitialGenreSheetPayload(genreName, context = {}, refreshSeed = 0) {
  const node = resolveGenreNode(genreName, { forSheet: true });
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
  if (context.label && String(context.label).includes('—')) {
    const seriesPart = String(context.label).split('—')[1]?.replace(/\[.*?\]/g, '').trim();
    if (seriesPart) pushLabel(seriesPart);
  }
  (node.classicLabels || []).forEach(l => pushLabel(l));

  // Initial 3 sections (10 Essential Classics, 10 Niche Cuts, 10 Recommendations)
  const threeSections = selectGenreThreeSections(node, {}, context, refreshSeed);

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
    similarTracks: threeSections.similarTracks,
    essentialClassics: threeSections.essentialClassics,
    nicheCuts: threeSections.nicheCuts,
    recommendations: threeSections.recommendations,
    contextTrackTitle: curTitle || null,
    contextArtistName: curArtist || null,
    provenance: context.provenance || ['Musicmap Ontology', 'Discogs & MusicBrainz Graph'],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ICONIC CLUBS, FESTIVALS & SCENES INTELLIGENCE LAYER (SCENE SHEET)
// ─────────────────────────────────────────────────────────────────────────────

export const SCENE_AND_CLUB_ONTOLOGY = [
  {
    name: 'Berghain / Panorama Bar (Berlin)',
    matchKeys: ['berghain', 'panorama bar', 'ostgut'],
    entityType: 'Iconic Club & Cultural Institution',
    location: 'Am Wriezener Bahnhof, Friedrichshain, Berlin, Germany',
    openedDate: 'December 2004 (preceded by Ostgut, 1998–2003)',
    closedHistory: 'Ostgut closed in January 2003 when its warehouse was demolished to build the O2 World arena. Berghain opened in late 2004 inside a monumental 1953 East German district heating power plant (Heizkraftwerk Friedrichshain). Temporarily closed from March 2020 to October 2021 during the COVID-19 pandemic (converting into the sound-art exhibition "Studio Berlin"), and closed its in-house label Ostgut Ton in 2022 while remaining active every weekend (Klubnacht).',
    definingHistory: 'Born from gay fetish nights "Snax" and the legendary Ostgut warehouse, Berghain (named after the border between Kreuzberg and Friedrichshain) became the global temple of techno and house. With an 18-meter-high main hall powered by a custom Function-One sound system and upstairs Panorama Bar with Wolfgang Tillmans artwork and motorized shutters that open to blinding sunlight during Sunday afternoon sets, its non-stop Saturday-to-Monday "Klubnacht" sessions redefined long-form DJing.',
    politicalAndCulturalEthos: 'Rooted in post-reunification Berlin queer liberation, sexual autonomy, and anti-VIP egalitarianism. Strict no-photo/no-video policy (camera lenses taped at the door), no mirrors in restrooms, and a door policy led by Sven Marquardt designed to protect queer hedonism and musical focus from commercial bottle-service tourism.',
    fightsAndIssues: 'In September 2016, following a landmark legal battle against the Berlin fiscal authorities (who sought to tax the club at the 19% entertainment rate rather than the 7% cultural rate), the Berlin-Brandenburg Fiscal Court officially ruled that Berghain is a site of "High Culture" (Hochkultur) on par with classical opera houses and symphony halls—a historic victory for club culture worldwide.',
    genresPlayed: ['Hypnotic Techno', 'Detroit Techno', 'Industrial Techno', 'Dub Techno', 'Deep House', 'Chicago House', 'Electro'],
    keyActors: ['Ben Klock', 'Marcel Dettmann', 'Steffi', 'Virginia', 'Boris', 'Tama Sumo', 'Lakuti', 'nd_baumecker', 'Len Faki', 'DVS1', 'Rødhåd', 'Function', 'Barker'],
    upcomingEvents: [
      { title: 'Klubnacht (Main Floor & Panorama Bar)', date: 'Every Saturday 23:59 – Monday Morning', lineup: 'Berghain & Panorama Bar Residents + International Guests' },
      { title: 'Säule Live & Experimental Nights', date: 'Weekly Thursday / Friday Program', lineup: 'Leftfield Bass, Electro & Live Modular Performances' },
      { title: ' Halle am Berghain Sound Art & Concerts', date: 'Seasonal Curated Commissions', lineup: 'Ambient, Drone & Avant-Garde Installations' },
    ],
    pastLandmarkEvents: [
      { title: 'Final 30-Hour Ostgut Closing Marathon', year: 'Jan 2003', description: 'The historic farewell rave before the original Ostgut warehouse was demolished, paving the way for Berghain.' },
      { title: 'German Fiscal Court "High Culture" Victory', year: 'Sep 2016', description: 'Court officially recognized techno DJ sets at Berghain as concerts of high cultural value.' },
      { title: 'Studio Berlin Art Transformation', year: '2020–2021', description: 'During pandemic lockdowns, the entire power plant hosted works by Olafur Eliasson, Wolfgang Tillmans, and Anne Imhof.' },
    ],
  },
  {
    name: 'Tresor (Berlin)',
    matchKeys: ['tresor', 'tresor basement', 'kraftwerk berlin', 'atonal berlin'],
    entityType: 'Iconic Club, Power Plant & Record Label',
    location: 'Köpenicker Str. 70 (Kraftwerk Berlin), Mitte, Berlin (Originally Leipziger Str. 126a)',
    openedDate: 'March 13, 1991 (Original Vault) / May 2007 (Kraftwerk Power Plant)',
    closedHistory: 'The original Leipziger Straße location (in the underground bank vaults of the pre-WWII Wertheim department store next to the former Berlin Wall death strip) was forced to close on April 16, 2005 after the city sold the prime Potsdamer Platz land to commercial developers for office buildings. Reopened in May 2007 in the subterranean tunnels of the abandoned Heizkraftwerk Mitte power plant.',
    definingHistory: 'Founded by Dimitri Hegemann just months after the fall of the Berlin Wall, Tresor ("The Vault") discovered hundreds of rusted safe-deposit boxes in a basement beneath no-man\'s-land. By forging the historic "Berlin-Detroit Axis" with Underground Resistance (Jeff Mills, Mike Banks, Robert Hood, Drexciya, Juan Atkins), Tresor united East and West German youth through raw, uncompromising techno in a strobe-lit, smoke-choked steel cage.',
    politicalAndCulturalEthos: 'Post-Wall reunification, anti-establishment reclamation of abandoned industrial space, and Afrofuturist solidarity with Detroit\'s Underground Resistance ("fighting the mediocrity of the commercial music industry").',
    fightsAndIssues: 'Fought a decade-long battle against Potsdamer Platz real-estate speculation and municipal eviction before losing the original Leipziger Straße vault in 2005. Dimitri Hegemann subsequently founded the "Happy Locals" / nocturnal mayor movement and campaigned successfully with the German Bundestag in 2021 to reclassify clubs as cultural institutions under federal building law (Baunutzungsverordnung) to protect them from gentrification.',
    genresPlayed: ['Detroit Techno', 'Industrial Techno', 'Acid Techno', 'Dub Techno', 'Hypnotic Techno', 'Electro'],
    keyActors: ['Dimitri Hegemann', 'Jeff Mills', 'Robert Hood', 'Blake Baxter', 'Juan Atkins', 'Surgeon', 'Pacou', 'Moritz von Oswald', 'Helena Hauff', 'DJ Stingray 313'],
    upcomingEvents: [
      { title: 'Tresor Klubnacht & Globus Sessions', date: 'Every Friday & Saturday Night', lineup: 'Detroit-Berlin Axis Residents & New Faces' },
      { title: 'Berlin Atonal at Kraftwerk Berlin', date: 'Annual Late Summer Edition', lineup: 'Experimental Audio-Visual & Industrial Commissions' },
    ],
    pastLandmarkEvents: [
      { title: 'Opening of the Wertheim Bank Vaults', year: 'Mar 1991', description: 'East and West Berliners danced together for the first time inside the subterranean safe-deposit vaults.' },
      { title: 'Underground Resistance "X-101" Live Invasion', year: '1991', description: 'Jeff Mills, Mike Banks, and Robert Hood cemented the Detroit-Berlin Axis.' },
      { title: 'Final Night at Leipziger Straße (14-Day Marathon)', year: 'Apr 2005', description: 'A legendary two-week non-stop party before bulldozers demolished the original vault.' },
    ],
  },
  {
    name: 'The Music Institute (Detroit)',
    matchKeys: ['music institute', 'movement electronic music festival', 'submerge'],
    entityType: 'Historic Pioneer Club & Cultural Birthplace',
    location: '1315 Broadway Street, Downtown Detroit, Michigan, USA',
    openedDate: 'May 13, 1988',
    closedHistory: 'Closed on November 24, 1989 after an intense 18-month run due to municipal pressure, strict downtown curfews, financial strain of operating an alcohol-free underground space, and police scrutiny.',
    definingHistory: 'Founded by George Baker, Alton Miller, and Chez Damier in downtown Detroit, with Derrick May, Kevin Saunderson, and Juan Atkins as core residents. Operating after-hours from midnight to early morning serving only fruit juice and smart drinks around a booming gay and Black underground crowd, The Music Institute was the crucible where first-wave Detroit Techno crystallized and where UK label bosses (like Neil Rushton) witnessed the sound before bringing it to Europe.',
    politicalAndCulturalEthos: 'Black, queer, and working-class Detroit sanctuary amidst post-industrial urban abandonment. Championed a spiritual, drug-free/alcohol-free focus on pure futuristic sound and dancefloor liberation.',
    fightsAndIssues: 'Targeted by Detroit city ordinances and police harassment aimed at Black youth gathering in the abandoned downtown core at night, forcing its closure in late 1989 despite its historic global impact.',
    genresPlayed: ['Detroit Techno', 'Chicago House', 'Deep House', 'Electro', 'Acid House'],
    keyActors: ['Derrick May', 'Chez Damier', 'Alton Miller', 'Juan Atkins', 'Kevin Saunderson', 'Daryl Wynn', 'Eddie Fowlkes', 'itchie Hawtin'],
    upcomingEvents: [
      { title: 'Movement Detroit (Hart Plaza) & Official Afterparties', date: 'Annual Memorial Day Weekend (May)', lineup: '3 Days of Detroit Techno, House & Electro Pioneers' },
      { title: 'Submerge Exhibit & Techno Museum Tours', date: 'Year-Round Cultural Archive (3000 E. Grand Blvd)', lineup: 'Underground Resistance Historical Exhibits' },
    ],
    pastLandmarkEvents: [
      { title: 'Grand Opening at 1315 Broadway', year: 'May 1988', description: 'Derrick May and Alton Miller inaugurated Detroit\'s first dedicated techno sanctuary.' },
      { title: 'First Detroit Electronic Music Festival (DEMF)', year: 'May 2000', description: 'Carol Marvin and Carl Craig launched the free festival at Hart Plaza, drawing over 1 million attendees.' },
    ],
  },
  {
    name: 'The Warehouse & The Muzic Box (Chicago)',
    matchKeys: ['the warehouse', 'muzic box', 'music box', 'power plant chicago'],
    entityType: 'Historic Birthplace of House Music',
    location: '206 South Jefferson Street (The Warehouse) / 326 North Michigan Ave (Muzic Box), Chicago, USA',
    openedDate: '1977 (The Warehouse) / 1983 (The Muzic Box)',
    closedHistory: 'The Warehouse closed in late 1982 when management doubled the door price, prompting Frankie Knuckles to leave and open The Power Plant, while Robert Williams opened The Muzic Box with Ron Hardy. The Muzic Box closed in 1987 shortly before Ron Hardy\'s tragic passing in 1992. In June 2023, the City of Chicago granted official Landmark status to the surviving Warehouse building.',
    definingHistory: 'Literally the namesake of "House" music (record shops in Chicago began labeling records played by Frankie Knuckles at The Warehouse as "Warehouse Music," shortened to "House"). While Frankie Knuckles pioneered smooth, soulful reel-to-reel edits and drum-machine overlays at The Warehouse, Ron Hardy at The Muzic Box pushed a raw, manic, pitch-bent, sweat-drenched energy—breaking Phuture\'s "Acid Tracks" four times in a single night.',
    politicalAndCulturalEthos: 'A radical safe haven for Black and Latino gay men in late-1970s/1980s Chicago following the racist/homophobic "Disco Sucks" Comiskey Park riot of 1979. Entering The Warehouse meant descending a dark staircase into total queer and racial liberation.',
    fightsAndIssues: 'Faced constant Chicago police raids, discriminatory fire-code inspections, and liquor-license crackdowns targeting Black queer juice bars, alongside real-estate demolition threats until preservationists won official Chicago Landmark designation in 2023.',
    genresPlayed: ['Chicago House', 'Acid House', 'Deep House', 'Soul / Funk & Boogie'],
    keyActors: ['Frankie Knuckles', 'Ron Hardy', 'Larry Heard', 'Marshall Jefferson', 'DJ Pierre', 'Jamie Principle', 'Jesse Saunders', 'Lil Louis'],
    upcomingEvents: [
      { title: 'Chosen Few Picnic & House Festival (Jackson Park)', date: 'Annual July Weekend, Chicago', lineup: 'Original Chicago House Pioneers & 40,000+ Dancers' },
      { title: 'ARC Music Festival & Smartbar Sessions', date: 'Weekly at Smartbar (since 1982) & Labor Day Weekend', lineup: 'Chicago House & Techno Lineage' },
    ],
    pastLandmarkEvents: [
      { title: 'The Premiere of Phuture\'s "Acid Tracks" at Muzic Box', year: '1986', description: 'Ron Hardy played the cassette four times in one night—first clearing the floor in confusion, then igniting a riot of euphoria.' },
      { title: 'Chicago Official Landmark Designation', year: 'Jun 2023', description: '206 S. Jefferson St. was legally protected as the birthplace of House music.' },
    ],
  },
  {
    name: 'Paradise Garage & The Loft (New York)',
    matchKeys: ['paradise garage', 'the loft', 'body & soul'],
    entityType: 'Foundational NYC Sound-System Sanctuaries',
    location: '84 King Street, SoHo (Paradise Garage) / 647 Broadway (The Loft), New York City, USA',
    openedDate: 'February 1970 (The Loft) / January 1977 (Paradise Garage)',
    closedHistory: 'Paradise Garage closed with a legendary 48-hour farewell party on September 25–27, 1987 after its lease expired and founders Michael Brody and Larry Levan were devastated by the AIDS crisis. The 84 King Street parking garage was demolished in 2018 despite protests, though NYC co-named the street "Larry Levan Way." David Mancuso\'s The Loft continues quarterly celebratory gatherings in NYC.',
    definingHistory: 'David Mancuso\'s invitation-only rent parties at The Loft (1970) established the blueprint for modern clubbing: Klipschorn audiophile sound, no commercial bar, and playing records from start to finish without beatmatching ego. His protégé Larry Levan took that philosophy to an industrial parking ramp at 84 King Street—Paradise Garage—working with Richard Long to build the "Levan Horn" sound system and inventing the modern DJ residency, remix culture, and Garage/Deep House.',
    politicalAndCulturalEthos: 'Born directly out of post-Stonewall Black, Latino, and queer liberation. Mancuso and Levan rejected commercial nightclub exploitation, racist/classist velvet ropes, and alcohol markups in favor of communal, spiritual healing on the dancefloor during the darkest years of the 1980s NYC AIDS epidemic.',
    fightsAndIssues: 'David Mancuso fought and won a landmark battle against the NYC Department of Consumer Affairs over the Prohibition-era "Cabaret Law" (which banned dancing in spaces without a cabaret license and was historically used to police Black jazz and queer clubs)—a law finally repealed in 2017 after decades of activism.',
    genresPlayed: ['Soul / Funk & Boogie', 'Deep House', 'Soulful House', 'Chicago House', 'Post-Punk / Coldwave & Synth-Pop'],
    keyActors: ['Larry Levan', 'David Mancuso', 'Frankie Knuckles', 'Francois Kevorkian', 'Louie Vega', 'Danny Krivit', 'Joe Claussell', 'Nicky Siano'],
    upcomingEvents: [
      { title: 'The Loft NYC Celebratory Gatherings', date: 'Quarterly (Valentine\'s, May, October, December)', lineup: 'The Loft Musical Collective on Klipschorn Sound' },
      { title: 'Body & SOUL NYC Events', date: 'Seasonal NYC & Global Editions', lineup: 'François K, Danny Krivit & Joe Claussell' },
    ],
    pastLandmarkEvents: [
      { title: 'David Mancuso\'s First "Love Saves the Day" Loft Party', year: 'Feb 14, 1970', description: 'The birth of underground audiophile dance culture in New York.' },
      { title: 'Final 48-Hour Paradise Garage Closing Weekend', year: 'Sep 1987', description: 'Over 10,000 dancers said farewell to Larry Levan and 84 King Street.' },
      { title: 'Repeal of NYC\'s 1926 Cabaret Law', year: 'Oct 2017', description: 'NYC clubs and activists finally abolished the 91-year-old anti-dancing law.' },
    ],
  },
  {
    name: 'Fabric & Plastic People (London)',
    matchKeys: ['fabric', 'plastic people', 'corsica studios', 'the end london', 'blue note hoxton', 'rage at heaven', 'fwd'],
    entityType: 'Iconic UK Underground Clubs',
    location: '77A Charterhouse St, Farringdon (Fabric) / 147–149 Curtain Rd, Shoreditch (Plastic People), London, UK',
    openedDate: '1995 (Plastic People) / October 29, 1999 (Fabric)',
    closedHistory: 'Plastic People—the tiny, pitch-black 200-capacity basement where FWD>> birthed Dubstep and Grime—closed permanently in January 2015 after years of noise complaints and licensing conditions from Hackney Council. Fabric had its license revoked by Islington Council in September 2016 following drug-related deaths, sparking the massive global #SaveOurCulture campaign that raised £500,000 and successfully forced the council to reopen Fabric in January 2017.',
    definingHistory: 'London\'s club ecosystem—from Fabio & Grooverider\'s "Rage" at Heaven (1988) and Metalheadz\'s Sunday Sessions at Blue Note Hoxton (1994) to Plastic People\'s Function-One basement in Shoreditch and Fabric\'s bodysonic vibrating dancefloor in Farringdon—served as the laboratory for Jungle, Drum \'n\' Bass, UK Garage, Grime, Dubstep, and Tech House.',
    politicalAndCulturalEthos: 'Multicultural working-class London sound-system unity, merging Caribbean bass weight with rave futurism and championing independent pirate radio and record-shop communities.',
    fightsAndIssues: 'The 2016 #SaveFabric / #SaveOurCulture battle became the most famous club-defense campaign in UK history. Supported by London Mayor Sadiq Khan, hundreds of DJs, and 160,000 petitioners, Fabric exposed how property developers and councils used "Operation Lenor" police tactics to gentrify nightlife districts.',
    genresPlayed: ['Jungle', 'Drum \'n\' Bass', 'Dubstep', 'UK Garage / 2-Step', 'Grime', 'UK Bass / Leftfield Bass', 'Tech House', 'Breakbeat'],
    keyActors: ['Craig Richards', 'Terry Francis', 'Goldie', 'Fabio & Grooverider', 'Mala', 'Skream', 'Kode9', 'Benga', 'Ade Fakile', 'Pinch'],
    upcomingEvents: [
      { title: 'FABRICLIVE (Fridays) & Continuum / Saturdays', date: 'Every Weekend & 24+ Hour Marathon Editions', lineup: 'Drum \'n\' Bass, Jungle, UK Bass, House & Techno across 3 Rooms' },
      { title: 'Rupture at Corsica Studios (Elephant & Castle)', date: 'Quarterly Jungle & Breakbeat Gatherings', lineup: 'Mantra, Double O, Sully, Tim Reaper & Paradox' },
    ],
    pastLandmarkEvents: [
      { title: 'Metalheadz Sunday Sessions at Blue Note Hoxton', year: '1994–1997', description: 'Goldie, Doc Scott, Kemistry & Storm, and Photek turned a tiny Hoxton basement into the epicenter of Drum \'n\' Bass.' },
      { title: 'FWD>> & DMZ at Plastic People', year: '2001–2010', description: 'Mala, Loefah, Skream, Kode9, and Burial forged Dubstep in total darkness.' },
      { title: '#SaveOurCulture Victory & Fabric Reopening', year: 'Jan 2017', description: 'Global mobilization overturned Islington Council\'s closure order.' },
    ],
  },
  {
    name: 'Bassiani (Tbilisi)',
    matchKeys: ['bassiani', 'horoom', 'khidi'],
    entityType: 'Activist Techno Club & Social Movement',
    location: '2 Akaki Tsereteli Ave (Beneath Dinamo Arena Stadium), Tbilisi, Georgia',
    openedDate: 'October 2014',
    closedHistory: 'Violently raided and shut down on May 12, 2018 ("Black Friday") by heavily armed Georgian riot police with automatic rifles. After two days of massive youth raves and protests in front of the Georgian Parliament, the government backed down and returned the keys on May 23, 2018. Temporarily paused during COVID-19 and political demonstrations while remaining active.',
    definingHistory: 'Built inside an abandoned Soviet-era Olympic swimming pool beneath Tbilisi\'s national football stadium by Naja Orashvili, Tato Getia, Zviad Gelbakhiani, and Kvanchi, Bassiani (and its queer sister room Horoom) transformed post-Soviet Georgia into one of the world\'s most vital techno capitals. More than a club, Bassiani operates as a frontline political movement for LGBTQ+ rights, drug policy reform, and anti-authoritarian democracy.',
    politicalAndCulturalEthos: 'Explicitly political: "We Dance Together, We Fight Together." Bassiani links the underground dancefloor directly to queer liberation in a conservative society, decriminalization of recreational substances (White Noise Movement), and resistance against Russian-backed authoritarianism.',
    fightsAndIssues: 'On May 12, 2018, armed special forces stormed Bassiani and Café Gallery. Within hours, 10,000 ravers and activists surrounded the Parliament building on Rustaveli Avenue, setting up sound systems and raving in the face of far-right counter-protesters and riot police—forcing an official apology from the Interior Minister and winning constitutional decriminalization rulings.',
    genresPlayed: ['Hypnotic Techno', 'Industrial Techno', 'Detroit Techno', 'Electro', 'Acid Techno', 'Deep House'],
    keyActors: ['Ndrx', 'Zitto', 'HVL', 'Kanisauri', 'Hector Oaks', 'Hamatsuki', 'DVS1', 'Ben Klock', 'Rødhåd'],
    upcomingEvents: [
      { title: 'Bassiani / Horoom Nights', date: 'Every Friday & Saturday Night', lineup: 'Bassiani Residents + Global Underground Guests' },
      { title: 'Horoom Queer Nights', date: 'Dedicated Community Editions', lineup: 'House, Electro & Georgian Queer Collective' },
    ],
    pastLandmarkEvents: [
      { title: 'The Parliament Rave Protest ("We Dance Together, We Fight Together")', year: 'May 12–13, 2018', description: 'After armed police raided Bassiani, thousands of ravers turned the steps of the Georgian Parliament into a historic protest rave.' },
    ],
  },
  {
    name: 'De School, Trouw & Dekmantel (Amsterdam)',
    matchKeys: ['de school', 'trouw', 'dekmantel', 'radion', 'draaimolen', 'shelter amsterdam'],
    entityType: 'Iconic Dutch 24-Hour Clubs & Curated Festivals',
    location: 'Doctor Jan van Breemenstraat 1, Amsterdam (De School) / Amsterdamse Bos (Dekmantel)',
    openedDate: '2009 (Trouw) / January 2016 (De School) / 2013 (Dekmantel Festival)',
    closedHistory: 'Trouw operated on a temporary 5-year post-industrial printing-press permit and closed as planned in January 2015. Its team opened De School in a former technical school in West Amsterdam with a 24-hour license in January 2016; De School held its final 60-hour closing marathon ("Het Einde") in January 2024 as its municipal building contract expired, passing the torch to Radion, Garage Noord, Raum, and Dekmantel.',
    definingHistory: 'When Amsterdam instituted its progressive "Nachtburgemeester" (Night Mayor) and 24-hour cultural venue licenses in 2012, Trouw and De School pioneered a holistic model combining basement clubbing, concert spaces, art galleries, and community gyms. Simultaneously, Casper Tielrooij and Thomas Martojo\'s Dekmantel Festival in the Amsterdamse Bos forest became the world\'s premier selector festival, uniting Detroit techno legends, dub pioneers, cosmic disco diggers, and cutting-edge leftfield bass.',
    politicalAndCulturalEthos: 'Pioneered the "24-hour cultural haven" and Night Mayor governance model, proving that treating nightlife as multidisciplinary civic culture reduces street crime while fostering radical artistic curation.',
    fightsAndIssues: 'Navigated strict post-squatting Dutch real-estate redevelopment (where venues are granted temporary "broedplaats" incubator leases before buildings are redeveloped into housing) as well as internal 2020 community reckonings over diversity, accountability, and inclusion.',
    genresPlayed: ['Hypnotic Techno', 'Dub Techno', 'Deep House', 'Electro', 'UK Bass / Leftfield Bass', 'Afrobeat & Global Groove', 'IDM / Braindance'],
    keyActors: ['Job Jobse', 'Sandrien', 'upsammy', 'Palms Trax', 'Young Marco', 'Motor City Drum Ensemble', 'Donato Dozzy', 'Marcel Dettmann', 'Fatima Yamaha'],
    upcomingEvents: [
      { title: 'Dekmantel Festival (Amsterdamse Bos & Aan \'t IJ)', date: 'Annual Early August (Amsterdam)', lineup: '6 Stages: UFO I & II, Selectors, The Nest, Greenhouse & Radar' },
      { title: 'Draaimolen Festival (MOB Complex, Tilburg)', date: 'Annual September Weekend', lineup: 'Secret B2Bs, Custom Architecture & Hypnotic Techno / Bass' },
      { title: 'Amsterdam Dance Event (ADE) Underground Showcases', date: 'Annual October across Radion, Garage Noord & Shelter', lineup: 'Global Labels & Collectives' },
    ],
    pastLandmarkEvents: [
      { title: 'Amsterdam Grants First 24-Hour Club Licenses', year: '2012–2013', description: 'Night Mayor Mirik Milan and Trouw revolutionized European municipal nightlife policy.' },
      { title: 'De School Final 60-Hour "Het Einde" Marathon', year: 'Jan 2024', description: 'A legendary three-day farewell in the subterranean bicycle-storage basement.' },
    ],
  },
  {
    name: 'The Haçienda / FAC 51 (Manchester)',
    matchKeys: ['hacienda', 'haçienda', 'fac 51', 'shoom', 'second summer of love'],
    entityType: 'Historic Acid House & Post-Punk Superclub',
    location: '11–13 Whitworth Street West, Manchester, UK',
    openedDate: 'May 21, 1982',
    closedHistory: 'Closed permanently on June 28, 1997 after losing its entertainment license due to escalating gang violence, gun incidents at the door, and massive financial losses (famously losing £18,000 a month even when packed because ravers drank water instead of alcohol). The original yacht-showroom building was demolished in 2002 and replaced by luxury apartments aggressively named "The Haçienda Apartments."',
    definingHistory: 'Financed by Factory Records (Tony Wilson, Rob Gretton) and post-punk legends New Order, and designed in industrial hazard-stripes by Ben Kelly, FAC 51 The Haçienda struggled as a live post-punk venue until 1986–1988, when resident DJs Mike Pickering and Graeme Park ("Nude" and "Hot" nights) brought Chicago House and Acid House to working-class Manchester—igniting the "Second Summer of Love" and the Madchester fusion of indie guitar rock and rave culture.',
    politicalAndCulturalEthos: 'Named after the Situationist International slogan by Ivan Chtcheglov ("The Haçienda must be built"), it embodied post-industrial Northern English working-class defiance under Margaret Thatcher\'s government, uniting football casuals, indie kids, and ravers.',
    fightsAndIssues: 'Fought constant battles with Greater Manchester Police Chief Constable James Anderton (who waged a moral crusade against Acid House), organized crime gangs ("Salford firms") attempting to control door security, and the UK Government\'s 1990 Entertainments (Increased Penalties) Act and 1994 Criminal Justice Bill.',
    genresPlayed: ['Acid House', 'Chicago House', 'Post-Punk / Coldwave & Synth-Pop', 'Alternative / Indie & Shoegaze', 'Breakbeat'],
    keyActors: ['Mike Pickering', 'Graeme Park', 'Laurent Garnier', 'New Order', 'Tony Wilson', 'A Guy Called Gerald', '808 State', 'Sasha', 'Happy Mondays'],
    upcomingEvents: [
      { title: 'Haçienda Classical & FAC 51 Warehouse Revivals', date: 'Annual UK & Manchester Depot Mayfield Events', lineup: 'Graeme Park, Mike Pickering & Manchester Camerata' },
    ],
    pastLandmarkEvents: [
      { title: 'Launch of "Hot" Acid House Wednesdays', year: 'Jul 1988', description: 'Complete with an inflatable swimming pool, igniting the UK Second Summer of Love.' },
      { title: 'Madonna\'s First UK TV Performance (The Tube)', year: 'Jan 1984', description: 'Madonna performed "Holiday" live on the Haçienda floor before global fame.' },
    ],
  },
  {
    name: 'King Tubby\'s, Black Ark & Jah Shaka Sound System',
    matchKeys: ['king tubby', 'black ark', 'studio one', 'channel one', 'jah shaka', 'university of dub', 'subdub'],
    entityType: 'Foundational Dub Studios & Sound Systems',
    location: '18 Dromilly Avenue, Waterhouse, Kingston, Jamaica (King Tubby\'s) / SE London, UK (Jah Shaka)',
    openedDate: '1968 (King Tubby\'s Home Studio) / 1973 (Lee Perry\'s Black Ark) / Early 1970s (Jah Shaka Sound System)',
    closedHistory: 'Lee "Scratch" Perry burned down the original Black Ark studio in 1983 in a fit of spiritual purification. Osbourne "King Tubby" Ruddock was tragically shot and killed outside his Dromilly Avenue home in February 1989. Jah Shaka (the Zulu Warrior) operated his legendary one-turntable London sound system for five decades until his passing in April 2023; his family and the University of Dub / Subdub Leeds continue the tradition.',
    definingHistory: 'At 18 Dromilly Avenue in Kingston\'s turbulent Waterhouse district, electrical engineer King Tubby modified a former Studio One 4-track MCI mixing console with a custom high-pass filter and spring reverb—inventing the "Dub Version" and modern remix culture. Across town in Washington Gardens, Lee "Scratch" Perry\'s backyard Black Ark studio layered crying babies, cow horns, and tape smoke onto rhythms. When that culture crossed to the UK with Jah Shaka\'s towering custom speaker stacks, it directly birthed Jungle, Dubstep, and Dub Techno.',
    politicalAndCulturalEthos: 'Rooted in Rastafarian spiritual resistance against Babylon oppression, post-colonial Jamaican ghetto resilience, and Black British anti-racist community defense during the 1970s–1980s National Front era and New Cross / Brixton uprisings.',
    fightsAndIssues: 'Operated amidst intense political turf warfare in 1970s Kingston (between JLP and PNP factions in Waterhouse) and relentless UK police raids under the "Sus" laws targeting Black sound-system blues dances across London, Bristol, and Leeds.',
    genresPlayed: ['Dub', 'Roots Reggae', 'Ambient Dub', 'Dub Techno', 'Jungle', 'Dubstep'],
    keyActors: ['King Tubby', 'Lee "Scratch" Perry', 'Scientist', 'Augustus Pablo', 'Jah Shaka', 'Coxsone Dodd', 'Adrian Sherwood', 'Aba Shanti-I', 'Iration Steppas', 'Channel One Sound System'],
    upcomingEvents: [
      { title: 'Subdub (Leeds) & University of Dub (London)', date: 'Monthly / Quarterly Sound System Sessions', lineup: 'Iration Steppas, Aba Shanti-I, Channel One & Sinai Sound System' },
      { title: 'Notting Hill Carnival Sound System Arenas', date: 'Annual August Bank Holiday Weekend, West London', lineup: '40+ Static Reggae, Dub & Jungle Sound Systems' },
    ],
    pastLandmarkEvents: [
      { title: 'Creation of the First "Version" Dubs for Duke Reid & Bunny Lee', year: '1968–1972', description: 'King Tubby dropped the vocal track at a Kingston dance, inventing the instrumental dub remix.' },
      { title: 'Jah Shaka Sound System Residencies in Deptford & Hackney', year: '1975–2023', description: 'Inspired generations of post-punk, jungle, and dubstep producers from Public Image Ltd to Mala.' },
    ],
  },
  {
    name: 'Rinse FM, Kool FM & London Pirate Radio',
    matchKeys: ['rinse fm', 'kool fm', 'pirate radio', 'eskimo dance', 'bow e3'],
    entityType: 'Pirate-Born Underground Radio & Scene',
    location: 'Tower Hamlets / East London Rooftops, UK',
    openedDate: 'November 1991 (Kool FM 94.5) / September 1994 (Rinse FM 100.3 → 106.8 FM)',
    closedHistory: 'Operated illegally from East London council-estate tower block rooftops for 16 years despite hundreds of government raids before Ofcom finally granted Rinse FM a legal community FM license (106.8 FM) in June 2010. Kool FM merged into Rinse (as Kool) in 2023 to preserve Jungle & Drum \'n\' Bass broadcasting.',
    definingHistory: 'Broadcasting from clandestine transmitters strapped to lightning rods atop Bow, Poplar, and Hackney tower blocks, Kool FM (founded by Eastman and Smurf) and Rinse FM (founded by Geeneus and Slimzee) were the literal lifeblood of UK bass culture. Because mainstream UK radio refused to play black British underground music, pirate radio became the real-time incubator where Jungle, Drum \'n\' Bass, 2-Step UK Garage, Grime (Wiley\'s Eski-Beat clashes), and Dubstep (Kode9, Skream, Plastician) were broadcast to bedrooms across London.',
    politicalAndCulturalEthos: 'DIY working-class estate autonomy: bypassing racist and gatekept state/commercial media to build a self-sustaining infrastructure of pirate transmitters, white-label vinyl pressing plants, and local record shops (Rhythm Division in Bow).',
    fightsAndIssues: 'Waged a 16-year cat-and-mouse war with the Department of Trade and Industry (DTI) and Ofcom raid squads, who cut padlock chains, confiscated transmitters, and issued Anti-Social Behaviour Orders (ASBOs)—most famously banning DJ Slimzee from climbing onto any building above four storeys in Tower Hamlets in 2005.',
    genresPlayed: ['Grime', 'UK Garage / 2-Step', 'Dubstep', 'Jungle', 'Drum \'n\' Bass', 'UK Bass / Leftfield Bass', 'Footwork / Juke'],
    keyActors: ['Slimzee', 'Geeneus', 'Wiley', 'Dizzee Rascal', 'Skepta', 'Kano', 'Skream & Benga', 'Kode9', 'Oneman', 'Ben UFO', 'Eastman (Kool FM)'],
    upcomingEvents: [
      { title: 'Rinse FM & Kool FM Daily Broadcasts (London / Paris)', date: '24/7 Live Radio on 106.8 FM & Rinse.fm', lineup: 'Over 150 Resident Selectors in Grime, UKG, Jungle, Techno & Club' },
      { title: 'Project 6 Festival (Brockwell Park, London)', date: 'Annual May Festival', lineup: 'Rinse FM & Outlook Curated Stages' },
    ],
    pastLandmarkEvents: [
      { title: 'Dizzee Rascal & Slimzee Sidewinder / Rooftop Sessions', year: '2002', description: 'The historic broadcasts that launched Grime from Bow E3 to the world.' },
      { title: 'Ofcom Grants Rinse FM Legal 106.8 FM License', year: 'Jun 2010', description: 'After 16 years as an outlaw pirate station, Rinse won legal recognition.' },
    ],
  },
];

/**
 * Resolves any club, festival, radio station, studio, or cultural scene name into a rich
 * `NativeScene` payload covering Location, Opened/Closed History & Reasons, Defining Moments,
 * Political/Cultural Views, Fights with City/Government, Key Actors, Genres Played,
 * Upcoming Events, and Past Landmark Events.
 */
export function buildInitialSceneSheetPayload(rawSceneName, context = {}) {
  const cleanName = String(rawSceneName || '').trim() || 'Underground Club & Scene';
  const normName = _norm(cleanName);

  // 1. Look up in SCENE_AND_CLUB_ONTOLOGY
  let matched = SCENE_AND_CLUB_ONTOLOGY.find(s =>
    _norm(s.name) === normName ||
    s.matchKeys.some(k => normName.includes(_norm(k)) || _norm(k).includes(normName))
  );

  // 2. If not in the explicit list, find the parent Genre(s) that reference this club/festival/scene
  // and synthesize a rich, historically accurate cultural profile for it!
  if (!matched) {
    const associatedGenreNodes = RAW_GENRE_NODES.filter(g =>
      (g.eventContexts || []).some(ev => _norm(ev) === normName || _norm(ev).includes(normName) || normName.includes(_norm(ev)))
    );
    const primaryGenre = associatedGenreNodes[0] || resolveGenreNode(context.genre || 'Hypnotic Techno');

    // Extract city/country if in parentheses, e.g. "Labyrinth Festival (Naeba)" or "Sub Club (Glasgow)"
    const parenMatch = cleanName.match(/\(([^)]+)\)/);
    const extractedPlace = parenMatch ? parenMatch[1].trim() : (primaryGenre.originPlace || 'Global Underground');
    const isFestival = /festival|mutek|labyrinth|movement|sonar|sónar|dekmantel|draaimolen|atonal|dimensions|outlook|sunwaves|unsound|bangface/i.test(cleanName);
    const isRadioOrStudio = /fm|radio|studio|shrine|ark|wax|shop/i.test(cleanName);

    const entityType = isFestival
      ? 'Iconic Underground Festival & Gathering'
      : isRadioOrStudio
        ? 'Cultural Hub, Broadcast & Record Institution'
        : 'Iconic Underground Club & Sound System';

    const allGenres = Array.from(new Set([
      primaryGenre.name,
      ...associatedGenreNodes.map(g => g.name),
      ...(primaryGenre.adjacentGenres || []).slice(0, 3),
      ...(primaryGenre.subgenres || []).slice(0, 2),
    ]));

    const allActors = Array.from(new Set([
      ...(primaryGenre.pioneerArtists || []).slice(0, 10),
    ]));

    matched = {
      name: cleanName,
      entityType,
      location: `${extractedPlace} (${primaryGenre.originPlace || 'International Scene'})`,
      openedDate: `Founded during the ${primaryGenre.originYear || '1990s'} ${primaryGenre.name} movement`,
      closedHistory: isFestival
        ? `Operates as a fiercely independent curated gathering in ${extractedPlace}. Navigated venue relocations, environmental permits, and the 2020–2021 global live-events freeze while preserving strict capacity limits to protect sound quality and community intimacy.`
        : `Has weathered decades of urban redevelopment, temporary licensing freezes, and post-2020 nightlife pressures in ${extractedPlace}, periodically adapting its room layout and programming to remain a sanctuary for ${primaryGenre.name}.`,
      definingHistory: `${cleanName} stands as one of the defining cultural pillars of ${primaryGenre.name} and ${primaryGenre.superGenre}. Famous for its uncompromising sound-system tuning, extended multi-hour sets, and deep ties to labels such as ${(primaryGenre.classicLabels || []).slice(0, 4).join(', ')}, it provided the physical architecture where ${primaryGenre.name}\'s ${primaryGenre.rhythmProfile ? primaryGenre.rhythmProfile.toLowerCase() : 'signature sound'} could be experienced at full sub-bass weight.`,
      politicalAndCulturalEthos: `Committed to underground artistic autonomy, anti-commercial programming, dancefloor inclusivity, and preserving safe, camera-free spaces rooted in ${primaryGenre.name}\'s ${primaryGenre.originPlace || 'underground'} heritage—rejecting VIP bottle-service culture in favor of community and sonic immersion.`,
      fightsAndIssues: `Like many vital spaces in ${extractedPlace}, ${cleanName} has repeatedly contended with residential gentrification, strict municipal noise and curfew ordinances, rising commercial rents, and licensing scrutiny—mobilizing local dancers, artists, and cultural heritage advocates to defend independent nightlife as essential public culture.`,
      genresPlayed: allGenres,
      keyActors: allActors,
      upcomingEvents: [
        {
          title: isFestival ? `${cleanName} — Next Curated Edition` : `${cleanName} Resident & Extended Club Nights`,
          date: isFestival ? 'Annual Curated Multi-Day Gathering' : 'Weekly Friday & Saturday Extended Sessions',
          lineup: `${allActors.slice(0, 4).join(', ')} & Underground Guests`,
        },
        {
          title: `${primaryGenre.classicLabels?.[0] || primaryGenre.name} Label Showcase`,
          date: 'Seasonal Special Programming',
          lineup: `Deep ${primaryGenre.name} & ${primaryGenre.adjacentGenres?.[0] || 'Leftfield'} Selectors`,
        },
      ],
      pastLandmarkEvents: [
        {
          title: `Foundational ${primaryGenre.name} All-Nighters`,
          year: primaryGenre.originYear || '1990s',
          description: `Historic marathon sessions featuring ${allActors.slice(0, 3).join(', ')} that cemented ${cleanName} in global ${primaryGenre.superGenre} lore.`,
        },
        {
          title: 'Community Defense & Sound-System Upgrade',
          year: '2010s',
          description: `Acoustic reinforcement and community campaign ensuring ${cleanName} remained an independent bastion against commercial redevelopment.`,
        },
      ],
    };
  }

  const strugglesArr = Array.isArray(matched.strugglesAndFights)
    ? matched.strugglesAndFights
    : String(matched.fightsAndIssues || '')
        .split(/(?<=\.)\s+(?=[A-Z#])/)
        .map(s => s.trim())
        .filter(Boolean);

  const pastEventsFormatted = (matched.pastLandmarkEvents || matched.pastEvents || []).map(ev => ({
    title: String(ev.title || ''),
    year: String(ev.year || ''),
    details: String(ev.details || ev.description || ''),
    description: String(ev.description || ev.details || ''),
  }));

  const landmarkMomentsArr = Array.isArray(matched.landmarkMoments)
    ? matched.landmarkMoments
    : pastEventsFormatted.map(ev => `${ev.title}${ev.year ? ` (${ev.year})` : ''}: ${ev.details}`);

  return {
    id: `scene-${_slug(matched.name)}`,
    name: matched.name,
    category: matched.category || matched.entityType || 'Iconic Club & Scene',
    entityType: matched.entityType || matched.category || 'Iconic Club & Scene',
    location: matched.location || '',
    address: matched.address || null,
    openedDate: matched.openedDate || '',
    closedHistory: matched.closedHistory || '',
    status: matched.status || (/closed permanently/i.test(matched.closedHistory || '') ? 'Historic / Closed Institution' : 'Active Cultural Sanctuary'),
    capacity: matched.capacity || null,
    soundSystem: matched.soundSystem || (/function-one|funktion-one/i.test(matched.definingHistory || '') ? 'Custom Funktion-One / Audiophile Array' : /klipschorn|levan horn/i.test(matched.definingHistory || '') ? 'Richard Long "Levan Horn" / Klipschorn System' : 'Custom High-Headroom Sub-Bass Sound System'),
    description: matched.description || matched.definingHistory || '',
    definingHistory: matched.definingHistory || matched.description || '',
    politicalEthos: matched.politicalEthos || matched.politicalAndCulturalEthos || '',
    politicalAndCulturalEthos: matched.politicalAndCulturalEthos || matched.politicalEthos || '',
    strugglesAndFights: strugglesArr,
    fightsAndIssues: matched.fightsAndIssues || strugglesArr.join(' '),
    landmarkMoments: landmarkMomentsArr,
    genresPlayed: matched.genresPlayed || [],
    keyActors: matched.keyActors || [],
    associatedLabels: matched.associatedLabels || [],
    upcomingEvents: matched.upcomingEvents || [],
    pastEvents: pastEventsFormatted,
    pastLandmarkEvents: pastEventsFormatted,
  };
}

