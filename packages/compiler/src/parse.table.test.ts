import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { parse } from './sfc/parse.ts';

const range = (d: Diagnostic) => `${d.start.line}:${d.start.column}-${d.end.line}:${d.end.column}`;
const T = (content: string) => `<template>${content}</template>`;
const S = (css: string, attrs = '') => `<template></template><style${attrs}>${css}</style>`;
// An end of file inside the template also leaves the template (and open tags) without end tags.
const OPEN_TEMPLATE = 'VIBE1124 1:1-1:11';

// [code, source, range, other diagnostics the source cannot avoid]
const rows: [string, string, string, string[]?][] = [
  ['VIBE1001', '<script setup lang="ts"></script>', '1:1-1:1'],
  ['VIBE1002', '<template></template><template></template>', '1:22-1:32'],
  [
    'VIBE1003',
    '<template></template><script setup lang="ts"></script><script setup lang="ts"></script>',
    '1:55-1:79',
  ],
  ['VIBE1004', '<template></template><script lang="ts"></script>', '1:22-1:40'],
  [
    'VIBE1004',
    '<template></template><script lang="ts"></script><script setup lang="ts"></script>',
    '1:22-1:40',
  ],
  ['VIBE1005', '<template></template><script setup></script>', '1:22-1:36'],
  ['VIBE1005', '<template></template><script setup lang="js"></script>', '1:36-1:45'],
  [
    'VIBE1005',
    '<template></template><script setup lang="js" lang="ts"></script>',
    '1:36-1:45',
    ['VIBE1102 1:46-1:55'],
  ],
  ['VIBE1006', '<template src="a.html"></template>', '1:11-1:23'],
  ['VIBE1006', '<template></template><style src="a.css"></style>', '1:29-1:40'],
  ['VIBE1007', '<template></template><style module></style>', '1:29-1:35'],
  ['VIBE1008', '<template lang="pug"></template>', '1:11-1:21'],
  ['VIBE1009', '<template></template><style lang="sass2"></style>', '1:29-1:41'],
  ['VIBE1010', '<template functional></template>', '1:11-1:21'],
  ['VIBE1010', '<template></template><style vars="{}"></style>', '1:29-1:38'],
  ['VIBE1010', '<template v-pre></template>', '1:11-1:16'],
  ['VIBE1011', '<template></template><docs></docs>', '1:22-1:28'],
  ['VIBE1011', '<template></template><constructor x></constructor>', '1:22-1:37'],
  ['VIBE1012', '<template></template>\n  stray text\n', '2:3-2:13'],
  ['VIBE1013', '<template></template><script setup lang="ts" generic="T"></script>', '1:46-1:57'],
  ['VIBE1101', T('<![CDATA[x]]>'), '1:11-1:11'],
  ['VIBE1102', T('<p id="a" id="b"></p>'), '1:21-1:27'],
  ['VIBE1102', T('<p :a="x" :a="y"></p>'), '1:21-1:27'],
  ['VIBE1105', '<template><', '1:12-1:12', [OPEN_TEMPLATE]],
  ['VIBE1106', '<template><svg><![CDATA[x', '1:26-1:26', [OPEN_TEMPLATE, 'VIBE1124 1:11-1:16']],
  ['VIBE1107', '<template></template><!-- x', '1:28-1:28'],
  ['VIBE1109', '<template><p a="', '1:17-1:17', [OPEN_TEMPLATE]],
  ['VIBE1113', T('<p id=></p>'), '1:17-1:17'],
  ['VIBE1114', T('</>'), '1:13-1:13'],
  ['VIBE1117', T('<p a"b></p>'), '1:15-1:15'],
  ['VIBE1118', T('<p a=b"c></p>'), '1:17-1:17'],
  ['VIBE1119', T('<p =a></p>'), '1:14-1:14'],
  ['VIBE1121', T('<?xml?>'), '1:12-1:12'],
  ['VIBE1122', T('<p a/ b></p>'), '1:15-1:15'],
  ['VIBE1123', T('</p>'), '1:11-1:15'],
  ['VIBE1123', T('\n  </p\n  >'), '2:3-3:4'],
  ['VIBE1124', T('<p>'), '1:11-1:14'],
  ['VIBE1124', T('<p\n  id="a"><b></b>'), '1:11-2:10'],
  ['VIBE1125', T('<p>{{ a</p>'), '1:14-1:14', [OPEN_TEMPLATE, 'VIBE1124 1:11-1:14']],
  ['VIBE1126', T('<p v-></p>'), '1:14-1:14'],
  ['VIBE1127', T('<p v-a:[b c></p>'), '1:20-1:20'],
  ['VIBE4002', S(':slotted(a) {}'), '1:29-1:37'],
  ['VIBE4002', S('::v-slotted(a) {}', ' scoped'), '1:36-1:47'],
  ['VIBE4003', S('a { color: v-bind(c) }'), '1:40-1:46'],
  ['VIBE4004', S('.a >>> .b {}'), '1:32-1:35'],
  ['VIBE4004', S('.a /deep/ .b {}', ' lang="less"'), '1:44-1:50'],
  ['VIBE4004', S('::v-deep(.b) {}'), '1:29-1:37'],
  ['VIBE4004', S('a,\n::v-global(.b) {}', ' lang="scss"'), '2:1-2:11'],
];

describe('diagnostic locations', () => {
  it.each(rows)('%s in %j is reported at %s', (code, source, at, others = []) => {
    const { diagnostics } = parse(source, { filename: 'A.vibe' });
    const reported = diagnostics.map((d) => `${d.code} ${range(d)}`);
    expect(reported.toSorted()).toStrictEqual([`${code} ${at}`, ...others].toSorted());
  });

  it.each([
    S('/* >>> */ a {}'),
    S('/* ::v-deep :slotted( v-bind( /deep/ */'),
    S('// v-bind(x)\na {}', ' lang="scss"'),
    S('a {} // >>>', ' lang="sass"'),
    S('a::slotted(b) {}'),
  ])('reports nothing for the commented-out form in %j', (source) => {
    expect(parse(source, { filename: 'A.vibe' }).diagnostics).toStrictEqual([]);
  });
});
