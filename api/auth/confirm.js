// api/auth/confirm.js
// Relays the Supabase auth token through ree.fm so the email link
// shows https://ree.fm/... instead of https://supabase.co/...
// This fixes Gmail's "link URL doesn't match sending domain" filter.

export default function handler(req, res) {
  const { token, type = 'recovery' } = req.query;

  if (!token) {
    return res.status(400).send('Missing token — link may have expired.');
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const siteUrl     = 'https://ree.fm';

  // Build the Supabase verify URL — it will verify the token then
  // redirect back to ree.fm/auth/reset where the user sets their new password
  const redirectTo = encodeURIComponent(`${siteUrl}/auth/reset`);
  const verifyUrl  = `${supabaseUrl}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${redirectTo}`;

  return res.redirect(302, verifyUrl);
}
