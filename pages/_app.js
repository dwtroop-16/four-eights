// pages/_app.js
import '../styles/globals.css';
import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Fours &amp; Eights</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="A wild-card multiplayer game with The Bitch." />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
