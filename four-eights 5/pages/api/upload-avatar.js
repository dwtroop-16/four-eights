// pages/api/upload-avatar.js
// Optional avatar image upload. Requires a public Supabase Storage bucket
// named 'avatars'. Falls back gracefully (returns 503) when Supabase isn't
// configured, so the UI can hide the upload button.

import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(503).json({ error: 'Avatar upload not configured.' });
  }
  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'Missing dataUrl.' });
  }
  // Parse data URL: data:image/png;base64,XXXX
  const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Unsupported format. Use PNG/JPEG/WebP under 2MB.' });
  }
  const mime = match[1];
  const ext = match[2] === 'jpg' ? 'jpeg' : match[2];
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length > 2 * 1024 * 1024) {
    return res.status(413).json({ error: 'Image too large (max 2MB).' });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await sb.storage
    .from('avatars')
    .upload(filename, buffer, { contentType: mime, upsert: false });
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  const { data } = sb.storage.from('avatars').getPublicUrl(filename);
  return res.status(200).json({ url: data.publicUrl });
}
