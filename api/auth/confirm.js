// api/auth/confirm.js
// Relays the Supabase auth token through ree.fm so the email link
// shows https://ree.fm/... instead of https://supabase.co/...
// This fixes Gmail's "link URL doesn't match sending domain" filter.

export default function handler(req, res) {
  const { token, type = 'recovery' } = req.query;

  if (!token) {
    return res.status(400).send('Missing token — link may have expired.');
  }

  // Use env var if available, otherwise fall back to the known project URL
  const supabaseUrl = process.env.VITE_SUPABASE_URL
    || 'https://mbcwqglsovpvdrycenzx.supabase.co';

  // Redirect back to ree.fm root — this is already in Supabase's allowed
  // redirect URL list. App.jsx detects the access_token hash and routes to
  // /auth/reset automatically, so we don't need to specify the sub-path here.
  const redirectTo = encodeURIComponent('https://ree.fm');

  const verifyUrl = `${supabaseUrl}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${redirectTo}`;

  return res.redirect(302, verifyUrl);
}
