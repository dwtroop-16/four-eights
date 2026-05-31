// lib/avatars.js
// Two avatar options:
//   1) Preset: one of 16 emoji + one of 8 background colors. No storage.
//   2) Upload: full image stored in Supabase Storage. Requires SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY, and a public bucket named 'avatars'.

const PRESET_EMOJI = [
  '🦊', '🐺', '🦅', '🦉', '🐻', '🦁', '🐯', '🐉',
  '🦈', '🐍', '🦂', '🕷️', '👑', '💀', '🎭', '🃏',
];

const PRESET_COLORS = [
  '#c49a57', // gold
  '#b3142a', // crimson
  '#2c8a4a', // green
  '#1e6b9e', // blue
  '#7d3c98', // purple
  '#e67e22', // orange
  '#7a5230', // brown
  '#34495e', // slate
];

function defaultAvatar(seed = 0) {
  // Deterministic default based on seat order so two players don't collide.
  return {
    kind: 'preset',
    emoji: PRESET_EMOJI[seed % PRESET_EMOJI.length],
    color: PRESET_COLORS[seed % PRESET_COLORS.length],
  };
}

function validatePresetAvatar(avatar) {
  if (!avatar || avatar.kind !== 'preset') return null;
  if (!PRESET_EMOJI.includes(avatar.emoji)) return null;
  if (!PRESET_COLORS.includes(avatar.color)) return null;
  return { kind: 'preset', emoji: avatar.emoji, color: avatar.color };
}

function validateUploadAvatar(avatar) {
  // For uploaded avatars, the client passes a URL returned by the upload
  // endpoint. We don't accept arbitrary URLs to avoid mixed-content / abuse.
  if (!avatar || avatar.kind !== 'upload') return null;
  if (typeof avatar.url !== 'string') return null;
  // Only allow URLs from our own Supabase Storage bucket.
  const supaUrl = process.env.SUPABASE_URL;
  if (!supaUrl) return null;
  if (!avatar.url.startsWith(`${supaUrl}/storage/v1/object/public/avatars/`)) {
    return null;
  }
  return { kind: 'upload', url: avatar.url };
}

function validateAvatar(avatar) {
  return validatePresetAvatar(avatar) || validateUploadAvatar(avatar) || null;
}

module.exports = {
  PRESET_EMOJI,
  PRESET_COLORS,
  defaultAvatar,
  validateAvatar,
};
