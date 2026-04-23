import { Package, CheckCircle, Truck, Clock } from 'lucide-react';
import './Orders.css';

const mockOrders = [
  {
    id: 'ORD-2025-001',
    item: 'Aura System — Tour Tee (M)',
    artist: 'Aura System',
    cover: '/album1.png',
    price: '€28.00',
    date: '2025-03-12',
    status: 'delivered',
    tracking: 'DHL · DE123456789',
    deliveredOn: '2025-03-16',
  },
  {
    id: 'ORD-2025-002',
    item: 'Obsidian Records Hoodie (L)',
    artist: 'Obsidian Records',
    cover: '/album4.png',
    price: '€65.00',
    date: '2025-04-01',
    status: 'in_transit',
    tracking: 'DPD · FR987654321',
    eta: '2025-04-24',
  },
  {
    id: 'ORD-2025-003',
    item: 'Phantom Grid Tote Bag',
    artist: 'Phantom Grid',
    cover: '/album2.png',
    price: '€18.00',
    date: '2025-04-18',
    status: 'processing',
    tracking: null,
    eta: null,
  },
  {
    id: 'ORD-2024-009',
    item: 'Null Pointer Patch Set',
    artist: 'The Null Pointer',
    cover: '/album3.png',
    price: '€12.00',
    date: '2024-11-05',
    status: 'delivered',
    tracking: 'PostNL · NL443322110',
    deliveredOn: '2024-11-09',
  },
  {
    id: 'ORD-2024-007',
    item: 'Nocturnal Axis Cap',
    artist: 'Nocturnal Axis',
    cover: '/album5.png',
    price: '€32.00',
    date: '2024-09-22',
    status: 'delivered',
    tracking: 'UPS · 1Z999AA10123456784',
    deliveredOn: '2024-09-27',
  },
];

const STATUS = {
  delivered:  { label: 'Delivered',   icon: CheckCircle, colour: 'var(--text-primary)' },
  in_transit: { label: 'In Transit',  icon: Truck,       colour: 'var(--text-secondary)' },
  processing: { label: 'Processing',  icon: Clock,       colour: 'var(--text-muted)' },
};

export default function Orders() {
  return (
    <div className="page orders-page animate-in">
      <div className="orders-header">
        <Package size={18} strokeWidth={1.6} />
        <h1>Merch Orders</h1>
      </div>

      {mockOrders.length === 0 ? (
        <div className="orders-empty">
          <Package size={36} strokeWidth={1.2} style={{ opacity: 0.3 }} />
          <p>No orders yet.</p>
        </div>
      ) : (
        <div className="orders-list">
          {mockOrders.map(order => {
            const s = STATUS[order.status];
            const Icon = s.icon;
            return (
              <div key={order.id} className="order-card">
                <img src={order.cover} alt={order.item} className="order-cover" />

                <div className="order-body">
                  <div className="order-item">{order.item}</div>
                  <div className="order-artist">{order.artist}</div>

                  <div className="order-meta">
                    <span className="order-id">{order.id}</span>
                    <span className="order-dot">·</span>
                    <span className="order-date">{new Date(order.date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="order-dot">·</span>
                    <span className="order-price">{order.price}</span>
                  </div>

                  {order.tracking && (
                    <div className="order-tracking">{order.tracking}</div>
                  )}

                  {order.eta && (
                    <div className="order-eta">Est. delivery: {new Date(order.eta).toLocaleDateString('en', { day: 'numeric', month: 'short' })}</div>
                  )}

                  {order.deliveredOn && (
                    <div className="order-eta">Delivered on {new Date(order.deliveredOn).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  )}
                </div>

                <div className="order-status" style={{ color: s.colour }}>
                  <Icon size={14} strokeWidth={1.8} />
                  <span>{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
