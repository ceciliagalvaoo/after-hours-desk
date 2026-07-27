import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'problem-and-solution',
    'evaluation-criteria',
    {
      type: 'category',
      label: 'How It Works',
      collapsed: false,
      items: ['how-it-works/architecture', 'how-it-works/nox-integration'],
    },
    {
      type: 'category',
      label: 'Using It',
      collapsed: false,
      items: ['using-it/user-flows', 'using-it/setup-and-deployment'],
    },
    {
      type: 'category',
      label: 'Project',
      collapsed: false,
      items: ['project/roadmap', 'project/team'],
    },
  ],
};

export default sidebars;
