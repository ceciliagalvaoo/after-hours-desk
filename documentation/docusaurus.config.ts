import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'After Hours Desk',
  tagline: 'A confidential OTC dark-pool desk on Nox (iExec), live on Ethereum Sepolia',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  // GitHub Pages deployment config.
  url: 'https://ceciliagalvaoo.github.io',
  baseUrl: '/after-hours-desk/',
  organizationName: 'ceciliagalvaoo',
  projectName: 'after-hours-desk',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/ceciliagalvaoo/after-hours-desk/tree/master/documentation/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
    },
    navbar: {
      title: 'After Hours Desk',
      logo: {
        alt: 'After Hours Desk',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://after-hours-desk.onrender.com',
          label: 'Live app',
          position: 'right',
        },
        {
          href: 'https://github.com/ceciliagalvaoo/after-hours-desk',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md',
          label: 'feedback.md',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {label: 'Problem & Solution', to: '/docs/problem-and-solution'},
            {label: 'Architecture', to: '/docs/how-it-works/architecture'},
            {label: 'User Flows & UX', to: '/docs/using-it/user-flows'},
            {label: 'Roadmap', to: '/docs/project/roadmap'},
          ],
        },
        {
          title: 'Project',
          items: [
            {label: 'Live app', href: 'https://after-hours-desk.onrender.com'},
            {label: 'GitHub Repository', href: 'https://github.com/ceciliagalvaoo/after-hours-desk'},
            {label: 'feedback.md', href: 'https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md'},
            {label: 'Live contract (Etherscan)', href: 'https://sepolia.etherscan.io/address/0x46b72a2615de7351699dcd5a64b854746a29fdb8'},
          ],
        },
        {
          title: 'Built for',
          items: [
            {label: 'iExec WTF Hackathon', href: 'https://dorahacks.io/hackathon/iexec-wtf'},
            {label: 'Nox Protocol docs', href: 'https://docs.iex.ec/nox-protocol/getting-started/welcome'},
          ],
        },
      ],
      copyright: `Built by Cecília Galvão and Pablo Azevedo · iExec WTF Hackathon (Summer Edition) · © ${new Date().getFullYear()}`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
