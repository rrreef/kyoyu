// api/admin-delete-user.js
// Vercel serverless function — uses SUPABASE_SERVICE_ROLE_KEY to delete auth.users
// Add SUPABASE_SERVICE_ROLE_KEY to Vercel → Project → Settings → Environment Variables

import { createClient } from '@supabase/supabase-js';

const adminClient = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  // Verify caller is a valid admin
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !caller) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single();

  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  // Parse body
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const { userId } = body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
}
