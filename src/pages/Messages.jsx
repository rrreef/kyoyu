import { useState, useEffect, useRef, useMemo } from 'react';
import { Send, Sparkles, Users, Disc, Play, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { openNativeAlbumFast, openRichArtistSheet, openRichLabelSheet, openRichGenreSheet } from '../components/ui/AlbumSheet';
import './Messages.css';

const DIGI_STORAGE_KEY = 'kyoyu-digi-messages-v1';
const CHATS_STORAGE_KEY = 'kyoyu-chat-threads-v1';

const INITIAL_DIGI_MESSAGES = [
  {
    id: 'digi-welcome',
    sender: 'DIGI',
    senderRole: 'ai',
    text: "Hi! I'm DIGI, your Kyoyu AI assistant. Ask me anything about how Kyoyu works, or ask me to find any artist, release, track, label, or genre.",
    timestamp: Date.now() - 3600 * 1000,
  },
];

const DEFAULT_DIRECT_CHATS = [
  {
    id: 'chat-aoi',
    username: 'Aoi',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
    messages: [
      {
        id: 'aoi-1',
        sender: 'Aoi',
        text: 'Did you check out that new dub techno pressing on Bandcamp?',
        timestamp: Date.now() - 86400 * 1000 * 2,
      },
      {
        id: 'aoi-2',
        sender: 'Aoi',
        text: 'I just shared it to the Community feed!',
        timestamp: Date.now() - 86400 * 1000 * 2 + 120000,
      },
    ],
  },
  {
    id: 'chat-kaito',
    username: 'Kaito',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80',
    messages: [
      {
        id: 'kaito-1',
        sender: 'Kaito',
        text: 'Putting together a vinyl wishlist basket for Friday.',
        timestamp: Date.now() - 86400 * 1000 * 3,
      },
    ],
  },
  {
    id: 'chat-sora',
    username: 'Sora',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=160&auto=format&fit=crop&q=80',
    messages: [
      {
        id: 'sora-1',
        sender: 'Sora',
        text: 'That Traumprinz LP is timeless.',
        timestamp: Date.now() - 86400 * 1000 * 4,
      },
    ],
  },
];

function formatTimeShort(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function buildKyoyuKnowledgeReply(question) {
  const q = question.toLowerCase();
  if (q.includes('basket') || q.includes('wishlist')) {
    return 'In Kyoyu, you can organize multiple Bandcamp Wishlist Baskets right inside the app! Tap the Wishlist button on any Bandcamp release to add it to a basket, view all your baskets as playlists under Library → Bandcamp → Wishlist, and tap "View Basket" inside any basket to open Bandcamp with all its items loaded directly into your Bandcamp cart.';
  }
  if (q.includes('share') || q.includes('community')) {
    return 'Whenever you tap the Share button on a release, track, artist, or label in Kyoyu, it is shared with your followers on the Home → Community section and automatically logged in the Community conversation right here in Chats so you can track everything you and the people you follow have shared.';
  }
  if (q.includes('layout') || q.includes('column') || q.includes('grid') || q.includes('list') || q.includes('setting')) {
    return 'Open Profile (top-right icon) → Settings to customize your Home and Library display layouts (List or 2–5 column Grid), reorder Home sections, and set your Streaming Services provider priority. Changes take effect immediately.';
  }
  if (q.includes('format') || q.includes('vinyl') || q.includes('lp') || q.includes('discogs')) {
    return 'Kyoyu aggregates all physical and digital formats (LP, Vinyl, 12", CD, Cassette, Digital) from Discogs master versions and Bandcamp packages at the bottom of every Album Sheet.';
  }
  if (q.includes('artist') && (q.includes('title') || q.includes('release'))) {
    return 'Inside any Artist Sheet, the Releases section displays full albums and EPs by default. Tap the "Releases" section title to switch to "Titles" (individual tracks), and use the sort button on the right to order by Newest or Oldest.';
  }
  if (q.includes('radio')) {
    return 'Tap the Radio icon in the player sheet to generate a curated 33–66 track radio queue based on the current track, artist, label, and underground Discogs/Bandcamp connections.';
  }
  return null;
}

export default function Messages() {
  const { user } = useAuth();
  const catalogReleases = useMemo(() => {
    try {
      const raw = localStorage.getItem('kyoyu-public-releases-cache-v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const currentUserName = useMemo(() => {
    return (
      localStorage.getItem('kyoyu-profile-display-name') ||
      user?.displayName ||
      user?.user_metadata?.display_name ||
      user?.user_metadata?.username ||
      (user?.email ? user.email.split('@')[0] : '') ||
      'You'
    );
  }, [user]);

  const [selectedChatId, setSelectedChatId] = useState('digi');
  const [searchQuery, setSearchQuery] = useState(() => window.__kyoyuChatSearchQuery || '');
  const [draft, setDraft] = useState('');
  const [digiTyping, setDigiTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // DIGI messages
  const [digiMessages, setDigiMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(DIGI_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_DIGI_MESSAGES;
    } catch {
      return INITIAL_DIGI_MESSAGES;
    }
  });

  // Direct user threads
  const [directChats, setDirectChats] = useState(() => {
    try {
      const raw = localStorage.getItem(CHATS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_DIRECT_CHATS;
    } catch {
      return DEFAULT_DIRECT_CHATS;
    }
  });

  // Community shared posts (user's own shares + followed people's shares)
  const [communityPosts, setCommunityPosts] = useState(() => {
    try {
      const raw = localStorage.getItem('kyoyu-community-posts-v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Sync Community posts from localStorage & native share events
  useEffect(() => {
    const syncCommunity = () => {
      try {
        const raw = localStorage.getItem('kyoyu-community-posts-v1');
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) setCommunityPosts(parsed);
      } catch {}
    };
    window.addEventListener('kyoyu-community-posts-change', syncCommunity);
    window.addEventListener('storage', syncCommunity);
    window.addEventListener('focus', syncCommunity);
    return () => {
      window.removeEventListener('kyoyu-community-posts-change', syncCommunity);
      window.removeEventListener('storage', syncCommunity);
      window.removeEventListener('focus', syncCommunity);
    };
  }, []);

  // Listen to native bottom-right search button when on Chats page
  useEffect(() => {
    window.__kyoyuIsOnChatsPage = true;
    const handleChatSearch = (e) => {
      const q = typeof e?.detail?.query === 'string'
        ? e.detail.query
        : (typeof e?.detail === 'string' ? e.detail : (window.__kyoyuChatSearchQuery || ''));
      setSearchQuery(q);
    };
    window.addEventListener('kyoyu-chat-search', handleChatSearch);
    return () => {
      window.__kyoyuIsOnChatsPage = false;
      window.removeEventListener('kyoyu-chat-search', handleChatSearch);
    };
  }, []);

  // Build unified Community conversation messages (user shares + followed users' shares)
  const communityMessages = useMemo(() => {
    const fallbackSharers = ['Aoi', 'Kaito', 'Sora', 'Ren', 'Mika', 'Haru'];
    const seededFromFeed = (catalogReleases || []).slice(0, 6).map((alb, idx) => {
      const sharer = alb.tracks?.[0]?.uploaderName || alb.uploaderName || fallbackSharers[idx % fallbackSharers.length];
      return {
        id: `comm-seed-${alb.id || idx}`,
        sender: sharer,
        isOwn: false,
        timestamp: Date.now() - (idx + 1) * 3600 * 1000 * 5,
        text: `Shared ${alb.title || 'a release'} by ${alb.artist || 'Unknown Artist'}`,
        shareItem: {
          id: alb.id,
          entityType: 'album',
          title: alb.title || 'Untitled',
          artist: alb.artist || '',
          label: alb.label || '',
          cover: alb.cover || '',
          url: alb.url || alb.trackUrl || alb.tracks?.[0]?.trackUrl || '',
          formats: alb.formats || [],
          tracks: alb.tracks || [],
        },
      };
    });

    const userShareMsgs = (communityPosts || []).map((post, idx) => {
      const rawSharer = post.sharedByName || 'You';
      const isOwn =
        rawSharer === 'You' ||
        rawSharer.toLowerCase() === currentUserName.toLowerCase();
      const senderName = isOwn ? currentUserName : rawSharer;
      const eType = String(post.entityType || 'album').toLowerCase();
      const title = post.album || post.title || 'Untitled';
      const artist = post.artist || '';
      return {
        id: post.postId || post.id || `comm-user-${idx}`,
        sender: senderName,
        isOwn,
        timestamp: post.createdAt || Date.now(),
        text: post.messageText || (
          eType === 'artist'
            ? `Shared artist ${title}`
            : eType === 'label'
              ? `Shared label ${title}`
              : `Shared ${title}${artist ? ' by ' + artist : ''}`
        ),
        shareItem: post.messageOnly ? null : {
          id: post.id || post.postId || `share-${idx}`,
          entityType: eType,
          title,
          artist,
          label: post.label || '',
          cover: post.cover || post.artworkUrl || '',
          url: post.albumUrl || post.url || '',
          formats: post.formats || [],
          tracks: post.tracks || [],
        },
      };
    });

    const seen = new Set();
    const combined = [];
    for (const m of [...userShareMsgs, ...seededFromFeed]) {
      const key = m.shareItem
        ? `${m.shareItem.entityType}|${m.shareItem.title.toLowerCase()}|${m.shareItem.artist.toLowerCase()}|${m.sender}`
        : m.id;
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(m);
    }
    return combined.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [communityPosts, catalogReleases, currentUserName]);

  // Build full conversation list for left sidebar
  const allConversations = useMemo(() => {
    const lastDigi = digiMessages[digiMessages.length - 1];
    const lastComm = communityMessages[communityMessages.length - 1];

    const list = [
      {
        id: 'digi',
        username: 'DIGI',
        subtitle: 'Kyoyu AI Assistant',
        type: 'ai',
        avatar: null,
        messages: digiMessages,
        lastMessage: lastDigi?.text || 'Ask me anything about Kyoyu or music',
        timestamp: lastDigi?.timestamp || Date.now(),
      },
      {
        id: 'community',
        username: 'Community',
        subtitle: 'Your shares & people you follow',
        type: 'community',
        avatar: null,
        messages: communityMessages,
        lastMessage: lastComm?.text || 'Shared music from you & people you follow',
        timestamp: lastComm?.timestamp || Date.now(),
      },
      ...directChats.map((c) => {
        const lastMsg = (c.messages || [])[c.messages.length - 1];
        return {
          ...c,
          subtitle: `@${c.username.toLowerCase()}`,
          type: 'direct',
          lastMessage: lastMsg?.text || '',
          timestamp: lastMsg?.timestamp || 0,
        };
      }),
    ];

    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;

    return list.filter((conv) => {
      if (conv.username.toLowerCase().includes(q)) return true;
      if ((conv.subtitle || '').toLowerCase().includes(q)) return true;
      return (conv.messages || []).some((m) => {
        const textMatch = (m.text || '').toLowerCase().includes(q);
        const senderMatch = (m.sender || '').toLowerCase().includes(q);
        const itemMatch =
          m.shareItem &&
          (`${m.shareItem.title || ''} ${m.shareItem.artist || ''} ${m.shareItem.label || ''}`
            .toLowerCase()
            .includes(q));
        return textMatch || senderMatch || itemMatch;
      });
    });
  }, [digiMessages, communityMessages, directChats, searchQuery]);

  const activeConversation = useMemo(() => {
    return (
      allConversations.find((c) => c.id === selectedChatId) ||
      allConversations[0] ||
      null
    );
  }, [allConversations, selectedChatId]);

  const displayedMessages = useMemo(() => {
    if (!activeConversation) return [];
    const msgs = activeConversation.messages || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return msgs;
    // If the conversation username itself matches, show all messages or matching messages
    const matchingMsgs = msgs.filter((m) => {
      const textMatch = (m.text || '').toLowerCase().includes(q);
      const senderMatch = (m.sender || '').toLowerCase().includes(q);
      const itemMatch =
        m.shareItem &&
        (`${m.shareItem.title || ''} ${m.shareItem.artist || ''} ${m.shareItem.label || ''}`
          .toLowerCase()
          .includes(q));
      return textMatch || senderMatch || itemMatch;
    });
    return matchingMsgs.length > 0 ? matchingMsgs : msgs;
  }, [activeConversation, searchQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayedMessages.length, activeConversation?.id, digiTyping]);

  const handleOpenSharedItem = async (item) => {
    if (!item) return;
    const eType = String(item.entityType || 'album').toLowerCase();
    if (eType === 'artist') {
      openRichArtistSheet({
        name: item.title || item.artist || 'Artist',
        cover: item.cover || '',
        url: item.url || '',
      });
      return;
    }
    if (eType === 'label') {
      openRichLabelSheet({
        name: item.title || item.label || 'Label',
        cover: item.cover || '',
        url: item.url || '',
      });
      return;
    }
    if (eType === 'genre') {
      openRichGenreSheet(item.title);
      return;
    }
    // Album / Track release
    let tracks = Array.isArray(item.tracks) ? item.tracks : [];
    const url = item.url || '';
    if (tracks.length === 0 && url.includes('bandcamp.com')) {
      try {
        const r = await fetch('/api/bandcamp-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fetch-album', albumUrl: url }),
        });
        if (r.ok) {
          const d = await r.json();
          tracks = (d.tracks || []).map((t) => ({
            ...t,
            id: `bc-${t.trackId}`,
            url: t.streamUrl,
            trackUrl: t.trackUrl,
            providerItemId: t.trackUrl,
            cover: t.artworkUrl || item.cover || '',
          }));
        }
      } catch {}
    }
    openNativeAlbumFast({
      id: item.id || `chat-album-${item.title}`,
      title: item.title || 'Untitled',
      artist: item.artist || '',
      cover: item.cover || '',
      label: item.label || '',
      formats: item.formats || [],
      provider: url.includes('bandcamp.com') ? 'bandcamp' : 'native',
      url,
      tracks,
    });
  };

  const askDigiAI = async (userText) => {
    setDigiTyping(true);
    try {
      const knowledgeAnswer = buildKyoyuKnowledgeReply(userText);
      const cleanQuery = userText
        .replace(/^(search|find|play|show me|who is|what is|tell me about|recommend|look up)\s+/i, '')
        .trim();

      let foundCards = [];
      let artistBio = '';

      if (!knowledgeAnswer && cleanQuery.length >= 2) {
        const [bcRes, dcRes] = await Promise.all([
          fetch('/api/bandcamp-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: cleanQuery }),
          })
            .then((r) => (r.ok ? r.json() : { results: [] }))
            .catch(() => ({ results: [] })),
          fetch('/api/discogs-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: cleanQuery, type: 'all' }),
          })
            .then((r) => (r.ok ? r.json() : { results: [] }))
            .catch(() => ({ results: [] })),
        ]);

        const bcItems = (bcRes.results || []).slice(0, 3).map((r, idx) => ({
          id: `digi-bc-${idx}-${Date.now()}`,
          entityType: r.type === 'artist' ? 'artist' : r.type === 'label' ? 'label' : 'album',
          title: r.title || r.name || 'Untitled',
          artist: r.artist || r.type || 'Bandcamp',
          label: r.label || 'Bandcamp',
          cover: r.artworkUrl || r.cover || '',
          url: r.url || r.trackUrl || '',
        }));

        const dcItems = (dcRes.results || []).slice(0, 2).map((r, idx) => ({
          id: `digi-dc-${idx}-${Date.now()}`,
          entityType: r.type === 'artist' ? 'artist' : r.type === 'label' ? 'label' : 'album',
          title: r.title || 'Untitled',
          artist: r.artist || r.label || 'Discogs',
          label: r.label || '',
          cover: r.coverImage || r.thumb || '',
          url: r.uri ? `https://www.discogs.com${r.uri}` : '',
        }));

        foundCards = [...bcItems, ...dcItems].slice(0, 4);
      }

      let replyText = knowledgeAnswer;
      if (!replyText) {
        if (foundCards.length > 0) {
          replyText = `Here is what I found on Kyoyu for "${cleanQuery}". Tap any card below to open its sheet or listen:`;
        } else {
          replyText = `I can help you explore artists, releases, labels, genres, or answer any question about Kyoyu features (like Bandcamp Wishlist Baskets, Community shares, Provider Priority, Layout settings, or Radio). Try asking me to search for an artist or album!`;
        }
      }

      const aiMsg = {
        id: `digi-${Date.now()}`,
        sender: 'DIGI',
        senderRole: 'ai',
        text: artistBio ? `${replyText}\n\n${artistBio}` : replyText,
        cards: foundCards,
        timestamp: Date.now(),
      };

      setDigiMessages((prev) => {
        const next = [...prev, aiMsg];
        try {
          localStorage.setItem(DIGI_STORAGE_KEY, JSON.stringify(next.slice(-60)));
        } catch {}
        return next;
      });
    } finally {
      setDigiTyping(false);
    }
  };

  const sendMessageText = (rawText) => {
    const text = (rawText || '').trim();
    if (!text || !activeConversation) return;

    const now = Date.now();
    if (activeConversation.id === 'digi') {
      const userMsg = {
        id: `user-${now}`,
        sender: currentUserName,
        isOwn: true,
        text,
        timestamp: now,
      };
      setDigiMessages((prev) => {
        const next = [...prev, userMsg];
        try {
          localStorage.setItem(DIGI_STORAGE_KEY, JSON.stringify(next.slice(-60)));
        } catch {}
        return next;
      });
      askDigiAI(text);
    } else if (activeConversation.id === 'community') {
      const newPost = {
        postId: `comm-msg-${now}`,
        id: `comm-msg-${now}`,
        entityType: 'message',
        messageOnly: true,
        messageText: text,
        title: text,
        sharedByName: currentUserName,
        createdAt: now,
      };
      try {
        const raw = localStorage.getItem('kyoyu-community-posts-v1');
        const list = raw ? JSON.parse(raw) : [];
        const next = [newPost, ...(Array.isArray(list) ? list : [])];
        localStorage.setItem('kyoyu-community-posts-v1', JSON.stringify(next));
        setCommunityPosts(next);
        window.dispatchEvent(new Event('kyoyu-community-posts-change'));
      } catch {}
    } else {
      setDirectChats((prev) => {
        const next = prev.map((c) => {
          if (c.id !== activeConversation.id) return c;
          return {
            ...c,
            messages: [
              ...(c.messages || []),
              {
                id: `msg-${now}`,
                sender: currentUserName,
                isOwn: true,
                text,
                timestamp: now,
              },
            ],
          };
        });
        try {
          localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  };

  useEffect(() => {
    const handleChatSend = (e) => {
      const text =
        typeof e?.detail?.text === 'string'
          ? e.detail.text
          : typeof e?.detail === 'string'
            ? e.detail
            : '';
      if (text.trim()) {
        sendMessageText(text);
      }
    };
    window.addEventListener('kyoyu-chat-send', handleChatSend);
    return () => {
      window.removeEventListener('kyoyu-chat-send', handleChatSend);
    };
  });

  return (
    <div className="page messages-page animate-in">
      <div className="msg-fullscreen-layout">
        {/* ── FULL-SCREEN DISCUSSION PANE ── */}
        <section className="msg-thread-pane" aria-label="Selected Conversation">
          {activeConversation ? (
            <>
              <header className="msg-thread-header">
                <div className={`msg-conv-avatar msg-conv-avatar--${activeConversation.type} msg-conv-avatar--sm`}>
                  {activeConversation.type === 'ai' ? (
                    <Sparkles size={14} strokeWidth={2} />
                  ) : activeConversation.type === 'community' ? (
                    <Users size={14} strokeWidth={2} />
                  ) : activeConversation.avatar ? (
                    <img src={activeConversation.avatar} alt={activeConversation.username} />
                  ) : (
                    <span>{activeConversation.username.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="msg-thread-header-info">
                  <div className="msg-thread-title">{activeConversation.username}</div>
                  {activeConversation.subtitle && (
                    <div className="msg-thread-subtitle">{activeConversation.subtitle}</div>
                  )}
                </div>
              </header>

              <div className="msg-thread-messages">
                {displayedMessages.map((msg) => {
                  const isOwn =
                    msg.isOwn ||
                    (msg.sender &&
                      msg.sender.toLowerCase() === currentUserName.toLowerCase() &&
                      msg.sender !== 'DIGI');
                  return (
                    <div
                      key={msg.id}
                      className={`msg-bubble-row${isOwn ? ' msg-bubble-row--own' : ''}`}
                    >
                      <div className={`msg-bubble${isOwn ? ' msg-bubble--own' : ''}`}>
                        <div className="msg-bubble-header">
                          <span className="msg-bubble-sender">
                            {isOwn ? `${currentUserName} (You)` : msg.sender}
                          </span>
                          <span className="msg-bubble-time">{formatTimeShort(msg.timestamp)}</span>
                        </div>
                        {msg.text && <div className="msg-bubble-text">{msg.text}</div>}

                        {/* Shared item card (in Community chat or direct shares) */}
                        {msg.shareItem && (
                          <div
                            className="msg-shared-card"
                            onClick={() => handleOpenSharedItem(msg.shareItem)}
                          >
                            <div className="msg-shared-art">
                              {msg.shareItem.cover ? (
                                <img src={msg.shareItem.cover} alt={msg.shareItem.title} />
                              ) : (
                                <Disc size={20} />
                              )}
                            </div>
                            <div className="msg-shared-info">
                              <div className="msg-shared-title">{msg.shareItem.title}</div>
                              {msg.shareItem.artist && (
                                <div className="msg-shared-artist">{msg.shareItem.artist}</div>
                              )}
                              {msg.shareItem.label && (
                                <div className="msg-shared-label">{msg.shareItem.label}</div>
                              )}
                            </div>
                            <div className="msg-shared-action">
                              <ArrowUpRight size={16} />
                            </div>
                          </div>
                        )}

                        {/* DIGI AI Search Cards */}
                        {Array.isArray(msg.cards) && msg.cards.length > 0 && (
                          <div className="msg-digi-cards">
                            {msg.cards.map((card) => (
                              <div
                                key={card.id}
                                className="msg-shared-card"
                                onClick={() => handleOpenSharedItem(card)}
                              >
                                <div className="msg-shared-art">
                                  {card.cover ? (
                                    <img src={card.cover} alt={card.title} />
                                  ) : (
                                    <Disc size={18} />
                                  )}
                                </div>
                                <div className="msg-shared-info">
                                  <div className="msg-shared-title">{card.title}</div>
                                  <div className="msg-shared-artist">{card.artist}</div>
                                </div>
                                <div className="msg-shared-action">
                                  <Play size={14} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {digiTyping && activeConversation.id === 'digi' && (
                  <div className="msg-bubble-row">
                    <div className="msg-bubble">
                      <div className="msg-bubble-text" style={{ opacity: 0.6 }}>
                        DIGI is searching…
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </>
          ) : (
            <div className="msg-empty">No conversations match your search.</div>
          )}
        </section>

        {/* ── FLOATING LEFT AVATAR BUTTONS (Profile-Button Style, Scrollable) ── */}
        <aside className="msg-floating-avatars" aria-label="Conversations">
          {allConversations.map((conv) => {
            const isSelected = activeConversation?.id === conv.id;
            return (
              <button
                key={conv.id}
                type="button"
                className={`msg-floating-avatar-btn${isSelected ? ' active' : ''}`}
                onClick={() => setSelectedChatId(conv.id)}
                title={conv.username}
                aria-label={conv.username}
              >
                <div className="msg-floating-avatar-inner">
                  {conv.type === 'ai' ? (
                    <Sparkles size={15} strokeWidth={2} />
                  ) : conv.type === 'community' ? (
                    <Users size={14} strokeWidth={2} />
                  ) : conv.avatar ? (
                    <img src={conv.avatar} alt={conv.username} />
                  ) : (
                    <span>{conv.username.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
              </button>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
