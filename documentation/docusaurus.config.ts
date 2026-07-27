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
        {
          href: 'https://x.com/AfterHoursDesk',
          label: 'X',
          position: 'right',
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
