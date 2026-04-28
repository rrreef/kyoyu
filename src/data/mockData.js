// =============================================
// KYOYU — Data
// All mock content removed. Real content comes from user uploads (localStorage).
// =============================================

export const artists = [];

export const labels = [];

export const releases = [];

export const vinylMarketplace = [];

export const djSets = [];

export const playlists = [];

// Payout simulation — zeroed until real data is connected
export const payoutData = {
  month: '',
  subscriptionAmount: 0,
  phaseShare: 0,
  artistPool: 0,
  topArtists: [],
  comparisonSpotify: 0,
};

// User profile stub — real data comes from AuthContext
export const userProfile = {
  id: '',
  name: '',
  email: '',
  plan: '',
  planPrice: 0,
  joined: '',
  totalPlays: 0,
  totalDownloads: 0,
  totalVinylOrders: 0,
  avatar: null,
};

// Dashboard stub — zeroed until real data is connected
export const dashboardData = {
  artist: null,
  totalStreams: 0,
  monthlyStreams: 0,
  streamGrowth: 0,
  totalDownloads: 0,
  downloadRevenue: 0,
  vinylSold: 0,
  vinylRevenue: 0,
  totalRevenue: 0,
  monthlyRevenue: 0,
  payoutPending: 0,
  contractStatus: '',
  exclusivityAvailable: false,
  topTracks: [],
  weeklyStreams: [0, 0, 0, 0, 0, 0, 0],
};

// Creator's uploaded releases — managed via upload flow
export const creatorReleases = [];

// ── User shelf data ──────────────────────────────────────────

export const myPlaylists = [];

export const likedAlbums = [];

export const savedPlaylists = [];

export const artistRadios = [];

export const merchItems = [];

export const upcomingEvents = [];
