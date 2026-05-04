import styles from './Home.module.css';

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1>Discover Your Next Adventure</h1>
        <p>Flights, Hotels, Packages & more — all in one place.</p>
      </div>
    </div>
  );
}
