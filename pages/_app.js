// pages/_app.js
import '../styles/globals.css';
import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Fours &amp; Eights</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content="A wild-card multiplayer card game where 4s and 8s are wild and the pot escalates. Stay in to win." />
        
        {/* Favicons */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        
        {/* Theme color for mobile browser chrome */}
        <meta name="theme-color" content="#0c2418" />
        
        {/* OpenGraph / Twitter */}
        <meta property="og:title" content="Fours & Eights" />
        <meta property="og:description" content="Stay in to win." />
        <meta property="og:image" content="/og-image.png" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="/og-image.png" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
