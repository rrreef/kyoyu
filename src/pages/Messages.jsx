import { useState } from 'react';
import { MessageCircle, ShoppingBag, Search, Check, Clock, Package } from 'lucide-react';
import './Messages.css';

/* ── Data — real conversations will come from backend ── */
const mockChats = [];

const mockRequests = [];

const STATUS = {
  pending:  { label: 'Pending',  icon: Clock,   colour: 'var(--text-muted)' },
  accepted: { label: 'Accepted', icon: Check,    colour: 'var(--text-primary)' },
  declined: { label: 'Declined', icon: Package,  colour: 'var(--text-dim)' },
};

export default function Messages() {
  const [tab, setTab] = useState('chats');
  const [query, setQuery] = useState('');

  const filteredChats = mockChats.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.preview.toLowerCase().includes(query.toLowerCase())
  );

  const filteredRequests = mockRequests.filter(r =>
    r.buyer.toLowerCase().includes(query.toLowerCase()) ||
    r.item.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="page messages-page animate-in">

      {/* ── Filter tabs + search ── */}
      <div className="msg-topbar">
        <div className="msg-tabs">
          <button
            className={`msg-tab${tab === 'chats' ? ' active' : ''}`}
            onClick={() => setTab('chats')}
          >
            <MessageCircle size={14} strokeWidth={1.8} />
            Messages
            {mockChats.filter(c => c.unread > 0).length > 0 && (
              <span className="msg-badge">
                {mockChats.filter(c => c.unread > 0).reduce((s, c) => s + c.unread, 0)}
              </span>
            )}
          </button>
          <button
            className={`msg-tab${tab === 'requests' ? ' active' : ''}`}
            onClick={() => setTab('requests')}
          >
            <ShoppingBag size={14} strokeWidth={1.8} />
            Purchase Requests
            {mockRequests.filter(r => r.status === 'pending').length > 0 && (
              <span className="msg-badge">
                {mockRequests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        <div className="msg-search">
          <Search size={13} />
          <input
            type="text"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Chats ── */}
      {tab === 'chats' && (
        <div className="msg-list">
          {filteredChats.length === 0 && (
            <div className="msg-empty"><p>No conversations found.</p></div>
          )}
          {filteredChats.map(chat => (
            <div key={chat.id} className={`msg-row glass${chat.unread ? ' msg-row--unread' : ''}`}>
              <div className="msg-avatar">
                <span>{chat.initials}</span>
                {chat.type === 'group' && <div className="msg-group-dot" />}
              </div>
              <div className="msg-body">
                <div className="msg-name-row">
                  <span className="msg-name">{chat.name}</span>
                  <span className="msg-time">{chat.time}</span>
                </div>
                <div className="msg-preview">{chat.preview}</div>
              </div>
              {chat.unread > 0 && (
                <div className="msg-unread-dot">{chat.unread}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Purchase Requests ── */}
      {tab === 'requests' && (
        <div className="msg-list">
          {filteredRequests.length === 0 && (
            <div className="msg-empty"><p>No purchase requests found.</p></div>
          )}
          {filteredRequests.map(req => {
            const s = STATUS[req.status];
            const Icon = s.icon;
            return (
              <div key={req.id} className="msg-request glass">
                <div className="req-top">
                  <div className="req-buyer">@{req.buyer}</div>
                  <div className="req-status" style={{ color: s.colour }}>
                    <Icon size={12} strokeWidth={2} />
                    <span>{s.label}</span>
                  </div>
                </div>
                <div className="req-item">{req.item}</div>
                <div className="req-msg">"{req.message}"</div>
                <div className="req-footer">
                  <span className="req-price">{req.price}</span>
                  <span className="req-date">
                    {new Date(req.date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {req.status === 'pending' && (
                    <div className="req-actions">
                      <button className="req-btn req-btn--accept">Accept</button>
                      <button className="req-btn req-btn--decline">Decline</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
