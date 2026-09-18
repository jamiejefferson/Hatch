import { describe, expect, it } from 'vitest';
import { RefTable } from '../../src/main/cdp/refs';
import { buildOutline, findInOutline, renderOutline, type AxNode } from '../../src/main/cdp/snapshot';

let seq = 0;
const node = (role: string, name: string, children: AxNode[] = [], extra: Partial<AxNode> & { props?: Record<string, unknown> } = {}): AxNode[] => {
  seq += 1;
  const { props, ...rest } = extra;
  const self: AxNode = {
    nodeId: `n${seq}`,
    role: { value: role },
    name: { value: name },
    backendDOMNodeId: seq,
    properties: Object.entries(props ?? {}).map(([k, v]) => ({ name: k, value: { value: v } })),
    ...rest,
  };
  const flat: AxNode[] = [self];
  self.childIds = [];
  for (const child of children) {
    // Each child arrives as a flat subtree whose first node is its root.
    (child as AxNode & { parentId?: string }).parentId ??= self.nodeId;
    self.childIds.push(child.nodeId);
    flat.push(child);
  }
  return flat;
};
const tree = (role: string, name: string, kids: AxNode[][] = [], extra = {}): AxNode[] => {
  const roots = kids.map((k) => k[0]!);
  const [self] = node(role, name, roots, extra);
  return [self!, ...kids.flat()];
};

function fixture(): AxNode[] {
  seq = 0;
  return tree('RootWebArea', 'Pricing | Acme', [
    tree('navigation', '', [
      tree('link', 'Home', [tree('StaticText', 'Home')]),
      tree('generic', '', [tree('link', 'Docs', [tree('StaticText', 'Docs')])]),
    ]),
    tree('main', '', [
      tree('heading', 'Simple pricing', [tree('StaticText', 'Simple pricing')], { props: { level: 1 } }),
      tree('radiogroup', 'Billing period', [tree('radio', 'Monthly', [], { props: { checked: 'true' } }), tree('radio', 'Yearly', [], { props: { checked: 'false' } })]),
      tree('paragraph', '', [tree('StaticText', '£12 per seat per month')]),
      tree('generic', '', [], { ignored: true }),
      tree('form', 'Contact sales', [
        tree('LabelText', '', [tree('StaticText', 'Work email')]),
        tree('textbox', 'Work email', [], { props: { required: true }, value: { value: 'sam@studio.example' } }),
        tree('combobox', 'Team size', [tree('MenuListPopup', '', [tree('option', '1 to 10', [], { props: { selected: true } }), tree('option', '11 to 50')])], { props: { expanded: false } }),
        tree('button', 'Send', [tree('StaticText', 'Send')], { props: { disabled: true } }),
      ]),
      tree('Iframe', 'Payment', []),
    ]),
  ]);
}

describe('agent view outline', () => {
  it('renders structure, references and states, and drops noise', () => {
    const refs = new RefTable();
    const lines = buildOutline(fixture(), { title: 'Pricing | Acme', address: 'https://acme.example/pricing', refFor: (id) => refs.refFor(id) });
    expect(renderOutline(lines)).toBe(
      [
        'page "Pricing | Acme"  https://acme.example/pricing',
        '  navigation [e1]',
        '    link "Home" [e2]',
        '    link "Docs" [e3]',
        '  main [e4]',
        '    heading 1 "Simple pricing" [e5]',
        '    radiogroup "Billing period" [e6]',
        '      radio "Monthly" [e7] (checked)',
        '      radio "Yearly" [e8]',
        '    text "£12 per seat per month" [e9]',
        '    form "Contact sales" [e10]',
        '      textbox "Work email" [e11] (required)  value "sam@studio.example"',
        '      combobox "Team size" [e12] (collapsed)',
        '        option "1 to 10" (selected)',
        '        option "11 to 50"',
        '      button "Send" [e13] (disabled)',
        '    iframe "Payment" [e14] (not expanded)',
        '',
      ].join('\n'),
    );
  });

  it('keeps one reference per element across snapshots and clears on navigation', () => {
    const refs = new RefTable();
    const options = { title: 't', address: 'a', refFor: (id: number) => refs.refFor(id) };
    const first = renderOutline(buildOutline(fixture(), options));
    expect(renderOutline(buildOutline(fixture(), options))).toBe(first);
    const send = refs.nodeFor('e13');
    expect(send).toBeDefined();
    expect(refs.nodeFor('[e13]')).toBe(send);
    refs.clear();
    expect(refs.nodeFor('e13')).toBeUndefined();
  });

  it('reads one branch, redacts values after a sign-in fill and cuts long outlines', () => {
    const refs = new RefTable();
    const nodes = fixture();
    const form = nodes.find((n) => n.role?.value === 'form')!;
    const branch = buildOutline(nodes, { title: 't', address: 'a', refFor: (id) => refs.refFor(id), rootBackendNodeId: form.backendDOMNodeId, redactValues: true });
    expect(renderOutline(branch)).toBe('form "Contact sales" [e1]\n  textbox "Work email" [e2] (required)  value "•••"\n  combobox "Team size" [e3] (collapsed)\n    option "1 to 10" (selected)\n    option "11 to 50"\n  button "Send" [e4] (disabled)\n');
    const all = buildOutline(nodes, { title: 't', address: 'a', refFor: (id) => refs.refFor(id) });
    expect(renderOutline(all, 120)).toMatch(/more lines\. The outline stopped at 120 characters/);
  });

  it('finds lines by word and shows where they sit', () => {
    const refs = new RefTable();
    const lines = buildOutline(fixture(), { title: 't', address: 'a', refFor: (id) => refs.refFor(id) });
    expect(findInOutline(lines, 'button send')).toBe('button "Send" [e13] (disabled)    in main > form "Contact sales"');
    expect(findInOutline(lines, 'checkout')).toBe('Nothing in the agent view matches "checkout".');
  });
});
