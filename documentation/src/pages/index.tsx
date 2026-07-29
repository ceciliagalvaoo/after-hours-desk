import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import HomepageFeatures from '@site/src/components/HomepageFeatures';
import styles from './index.module.css';

const REPO = 'https://github.com/ceciliagalvaoo/after-hours-desk';
const LIVE_APP = 'https://after-hours-desk.onrender.com';
const FEEDBACK = 'https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md';
const X_URL = 'https://x.com/AfterHoursDesk';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  const talk = useBaseUrl('/img/broker/talk.gif');
  const smirk = useBaseUrl('/img/broker/smirk.gif');
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <div className={styles.mascotRow}>
          <img src={talk} alt="The Broker, explaining" className={styles.heroMascot} />
          <Heading as="h1" className={clsx('hero__title', styles.heroTitle)}>
            {siteConfig.title}
          </Heading>
          <img src={smirk} alt="The Broker, smirking" className={styles.heroMascot} />
        </div>

        <p className={styles.heroTagline}>{siteConfig.tagline}</p>
        <p className={styles.pitch}>
          Traders submit <strong>encrypted</strong> order sizes, encrypted in the browser, never a
          plaintext amount on calldata. The desk nets a batch entirely from composed Nox primitives
          and moves real confidential cUSDC. Only the matched aggregate and the live Uniswap
          execution price ever go public. <span className={styles.phosphor}>The trade is provable.
          The size never prints.</span>
        </p>

        <div className={styles.buttons}>
          <Link className={clsx(styles.btn, styles.btnPrimary)} to="/docs/intro">
            Read the docs
          </Link>
          <Link className={styles.btn} href={LIVE_APP}>
            Open the live app ↗
          </Link>
          <Link className={styles.btn} href={REPO}>
            GitHub
          </Link>
          <Link className={styles.btn} href={FEEDBACK}>
            feedback.md
          </Link>
          <Link className={styles.btn} href={X_URL}>
            @AfterHoursDesk ↗
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

type Member = {
  name: string;
  role: string;
  photo: string;
  broker: string;
  github: string;
  linkedin: string;
  discord: string;
};

const TEAM: Member[] = [
  {
    name: 'Cecília Galvão',
    role: 'Smart Contracts · Backend · Blockchain',
    photo: '/img/team/Cecilia.png',
    broker: '/img/broker/money.gif',
    github: 'https://github.com/ceciliagalvaoo',
    linkedin: 'https://www.linkedin.com/in/ceciliagalvaoo',
    discord: 'ceciliabtriz',
  },
  {
    name: 'Pablo Azevedo',
    role: 'Full-Stack · Frontend · Product',
    photo: '/img/team/Pablo.png',
    broker: '/img/broker/smirk.gif',
    github: 'https://github.com/zzaved',
    linkedin: 'https://www.linkedin.com/in/pabloazevedo',
    discord: 'zzaved',
  },
];

function TeamMember({member}: {member: Member}) {
  const photo = useBaseUrl(member.photo);
  const broker = useBaseUrl(member.broker);
  return (
    <div className={styles.teamCard}>
      <div className={styles.teamPhotoWrap}>
        <img src={photo} alt={member.name} className={styles.teamPhoto} />
        <img src={broker} alt={`The Broker mascot, animated beside ${member.name}`} className={styles.teamBroker} />
      </div>
      <p className={styles.teamName}>{member.name}</p>
      <p className={styles.teamRole}>{member.role}</p>
      <div className={styles.teamLinks}>
        <a className={styles.teamLink} href={member.github}>GitHub ↗</a>
        <a className={styles.teamLink} href={member.linkedin}>LinkedIn ↗</a>
        <span className={styles.teamLink}>Discord: {member.discord}</span>
      </div>
    </div>
  );
}

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

        <HomepageFeatures />

        <section className={styles.teamSection}>
          <div className="container">
            <Heading as="h2" className={styles.sectionHeading}>
              The desk crew
            </Heading>
            <p className={styles.sectionSub}>
              Built by two people for the iExec WTF Hackathon (Summer Edition).
            </p>
            <div className={styles.teamRow}>
              {TEAM.map((m) => (
                <TeamMember key={m.name} member={m} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
