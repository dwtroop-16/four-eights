// components/Avatar.js
import styles from '../styles/Avatar.module.css';

export default function Avatar({ avatar, size = 'md', dim }) {
  const cls = `${styles.avatar} ${styles[size]} ${dim ? styles.dim : ''}`;
  if (!avatar) {
    return <div className={cls} style={{ background: '#444' }}>?</div>;
  }
  if (avatar.kind === 'upload') {
    return (
      <div
        className={cls}
        style={{ backgroundImage: `url(${avatar.url})`, backgroundSize: 'cover' }}
      />
    );
  }
  return (
    <div className={cls} style={{ background: avatar.color }}>
      <span className={styles.emoji}>{avatar.emoji}</span>
    </div>
  );
}
