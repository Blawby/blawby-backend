interface DemoFileFixture {
  id: string;
  audience: 'client' | 'practice_owner';
  scopeType: 'matter';
  fileName: string;
  mimeType: 'text/plain';
  content: string;
}

const fixtureHeader = [
  'BLAWBY DEMO FILE - FICTIONAL DATA',
  'This document contains synthetic example content only.',
  'It does not describe a real person, client, matter, or legal event.',
  '',
].join('\n');

const demoFileFixtures: readonly DemoFileFixture[] = [
  {
    id: '29400000-0000-4000-8000-000000000001',
    audience: 'client',
    scopeType: 'matter',
    fileName: 'demo-client-matter-notes.txt',
    mimeType: 'text/plain',
    content: `${fixtureHeader}Client intake example\n\n- Goal: Review a fictional service agreement.\n- Timing: Routine.\n- Documents: Example agreement supplied for demonstration.\n`,
  },
  {
    id: '29400000-0000-4000-8000-000000000002',
    audience: 'practice_owner',
    scopeType: 'matter',
    fileName: 'demo-practice-matter-checklist.txt',
    mimeType: 'text/plain',
    content: `${fixtureHeader}Practice matter checklist example\n\n- Confirm fictional scope of work.\n- Review the synthetic intake summary.\n- Prepare a demonstration follow-up task.\n`,
  },
] as const;

export { demoFileFixtures };
export type { DemoFileFixture };
