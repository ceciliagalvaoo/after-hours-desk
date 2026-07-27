import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  tag: string;
  title: string;
  description: ReactNode;
  to: string;
};

const FeatureList: FeatureItem[] = [
  {
    tag: 'confidential',
    title: 'Encrypted order sizes',
    description: (
      <>
        Sizes are encrypted client-side before anything is sent: the chain only ever sees an opaque
        32-byte handle. The plaintext never touches Sepolia, not even for a moment.
      </>
    ),
    to: '/docs/problem-and-solution',
  },
  {
    tag: 'settlement',
    title: 'Real Nox settlement',
    description: (
      <>
        <code>settleBatch()</code> nets buys and sells entirely from composed Nox primitives and
        moves real confidential cUSDC balances, not bookkeeping in a mapping.
      </>
    ),
    to: '/docs/how-it-works/architecture',
  },
  {
    tag: 'composable',
    title: 'Public Uniswap reference',
    description: (
      <>
        Execution price is read live from a real, unmodified Uniswap V3 pool on Sepolia, called
        through a <code>view</code>-only adapter, never forked or wrapped.
      </>
    ),
    to: '/docs/how-it-works/architecture',
  },
  {
    tag: 'auditable',
    title: 'Audited disclosure',
    description: (
      <>
        A compliance viewer can decrypt every fill; each trader only their own; a stranger nothing at
        all, a real on-chain ACL, proven across four distinct accounts.
      </>
    ),
    to: '/docs/using-it/user-flows',
  },
];

function Feature({tag, title, description, to}: FeatureItem) {
  return (
    <div className="col col--3">
      <Link to={to} className={styles.featureCard}>
        <span className={styles.featureTag}>{tag}</span>
        <Heading as="h3" className={styles.featureTitle}>
          {title}
        </Heading>
        <p className={styles.featureBody}>{description}</p>
      </Link>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <Heading as="h2" className={styles.featuresHeading}>
          What makes it real
        </Heading>
        <div className="row">
          {FeatureList.map((props) => (
            <Feature key={props.title} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
