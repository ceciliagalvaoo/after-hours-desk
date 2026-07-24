import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <p className={styles.heroSub}>
          Built by Cecília Galvão and Pablo Azevedo for the iExec WTF Hackathon (Summer Edition)
        </p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/">
            Read the docs
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="https://github.com/ceciliagalvaoo/after-hours-desk">
            View on GitHub
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="https://sepolia.etherscan.io/address/0x46b72a2615de7351699dcd5a64b854746a29fdb8">
            Live contract ↗
          </Link>
        </div>
      </div>
    </header>
  );
}

const STATS: {label: string; value: string}[] = [
  {label: 'Contracts verified on Sepolia', value: '5/5'},
  {label: 'Unit tests passing', value: '23/23'},
  {label: 'Mocked UI data', value: 'Zero'},
  {label: 'Order size ever plaintext on-chain', value: 'Never'},
];

const HIGHLIGHTS: {title: string; body: string; to: string}[] = [
  {
    title: 'Confidential by construction',
    body:
      'Order sizes are encrypted client-side before anything is sent — the chain only ever sees an opaque handle. Only the matched aggregate and execution price ever become public, and only after settlement.',
    to: '/docs/problem-and-solution',
  },
  {
    title: 'Real Uniswap composability',
    body:
      'Execution price is read live from a real, unmodified, public Uniswap V3 pool on Sepolia — called, never forked or modified.',
    to: '/docs/architecture',
  },
  {
    title: 'Selective disclosure, enforced on-chain',
    body:
      'A compliance-viewer address can decrypt every fill; each trader can only decrypt their own — a real ACL check, tested with four genuinely distinct accounts.',
    to: '/docs/user-flows',
  },
];

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="A confidential OTC dark-pool settlement desk built on Nox (iExec), live on Ethereum Sepolia.">
      <HomepageHeader />
      <main>
        <section className={styles.statsSection}>
          <div className="container">
            <div className={styles.statsGrid}>
              {STATS.map((stat) => (
                <div key={stat.label} className={styles.statCard}>
                  <div className={styles.statValue}>{stat.value}</div>
                  <div className={styles.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className={styles.highlightsSection}>
          <div className="container">
            <div className="row">
              {HIGHLIGHTS.map((item) => (
                <div key={item.title} className="col col--4">
                  <Link to={item.to} className={styles.highlightCard}>
                    <Heading as="h3">{item.title}</Heading>
                    <p>{item.body}</p>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
