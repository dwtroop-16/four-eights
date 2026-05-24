// components/AvatarPicker.js
import { useState } from 'react';
import Avatar from './Avatar';
import styles from '../styles/AvatarPicker.module.css';

const PRESET_EMOJI = [
  '🦊','🐺','🦅','🦉','🐻','🦁','🐯','🐉',
  '🦈','🐍','🦂','🕷️','👑','💀','🎭','🃏',
];
const PRESET_COLORS = [
  '#c49a57','#b3142a','#2c8a4a','#1e6b9e',
  '#7d3c98','#e67e22','#7a5230','#34495e',
];

export default function AvatarPicker({ value, onChange }) {
  const [tab, setTab] = useState('preset');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const current = value || { kind: 'preset', emoji: PRESET_EMOJI[0], color: PRESET_COLORS[0] };

  function pickEmoji(emoji) {
    onChange({ kind: 'preset', emoji, color: current.color || PRESET_COLORS[0] });
  }
  function pickColor(color) {
    onChange({ kind: 'preset', emoji: current.emoji || PRESET_EMOJI[0], color });
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch('/api/upload-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      if (res.status === 503) {
        setError('Upload not enabled on this server. Use presets.');
        setUploading(false);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Upload failed.');
      } else {
        onChange({ kind: 'upload', url: json.url });
      }
    } catch (e) {
      setError(e.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.picker}>
      <div className={styles.preview}>
        <Avatar avatar={current} size="lg" />
      </div>
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'preset' ? styles.active : ''}`}
          onClick={() => setTab('preset')}
        >
          Preset
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'upload' ? styles.active : ''}`}
          onClick={() => setTab('upload')}
        >
          Upload
        </button>
      </div>
      {tab === 'preset' && (
        <>
          <div className={styles.grid}>
            {PRESET_EMOJI.map((e) => (
              <button
                type="button"
                key={e}
                className={`${styles.cell} ${current.emoji === e ? styles.selected : ''}`}
                onClick={() => pickEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
          <div className={styles.colors}>
            {PRESET_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`${styles.swatch} ${current.color === c ? styles.selected : ''}`}
                style={{ background: c }}
                onClick={() => pickColor(c)}
              />
            ))}
          </div>
        </>
      )}
      {tab === 'upload' && (
        <div className={styles.upload}>
          <label className={styles.uploadBtn}>
            {uploading ? 'Uploading…' : 'Choose image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onFile}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
          <div className={styles.uploadHint}>PNG/JPEG/WebP, under 2MB.</div>
          {error && <div className={styles.error}>{error}</div>}
        </div>
      )}
    </div>
  );
}
