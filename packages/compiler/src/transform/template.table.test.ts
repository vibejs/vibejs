import { describe, expect, it } from 'vitest';
import { run, sfc } from '../../test/transform.ts';

/** `[code, template, range]`: the template is the first line of the file, after `<template>`. */
const rows: [string, string, string][] = [
  ['VIBE2001', '<Missing />', '1:12-1:19'],
  ['VIBE2002', '<item />', '1:12-1:16'],
  ['VIBE2003', '<foo></foo>', '1:12-1:15'],
  ['VIBE2004', '<div><template>x</template></div>', '1:17-1:25'],
  ['VIBE2005', '<table>text</table>', '1:18-1:22'],
  ['VIBE2006', '<component is="Item" />', '1:22-1:31'],
  ['VIBE2009', '<div is="x"></div>', '1:16-1:22'],
  ['VIBE2011', '<div><style></style></div>', '1:17-1:22'],
  ['VIBE2101', '<p v-if></p>', '1:14-1:18'],
  ['VIBE2102', '<p v-else></p>', '1:14-1:20'],
  ['VIBE2103', '<p v-if="text" v-for="i in items" :key="i.id"></p>', '1:26-1:44'],
  ['VIBE2104', '<p v-if="text"></p><p v-else="text"></p>', '1:33-1:46'],
  ['VIBE2201', '<p v-for></p>', '1:14-1:19'],
  ['VIBE2202', '<p v-for="items"></p>', '1:21-1:26'],
  ['VIBE2203', '<p v-for="i in items"></p>', '1:14-1:32'],
  [
    'VIBE2204',
    '<template v-for="i in items" :key="i.id"><p :key="i.id"></p></template>',
    '1:55-1:66',
  ],
  ['VIBE2301', '<p @click></p>', '1:14-1:20'],
  ['VIBE2302', '<p v-on="text"></p>', '1:14-1:25'],
  ['VIBE2303', '<p @[text]="count++"></p>', '1:15-1:21'],
  ['VIBE2304', '<p @click.foo="count++"></p>', '1:21-1:24'],
  ['VIBE2305', '<Item @pick.stop="count++" />', '1:23-1:27'],
  ['VIBE2401', '<p :foo-bar></p>', '1:14-1:22'],
  ['VIBE2402', '<p :title.foo="text"></p>', '1:21-1:24'],
  ['VIBE2501', '<input v-model>', '1:18-1:25'],
  ['VIBE2502', '<input v-model="text + 1">', '1:27-1:35'],
  ['VIBE2503', '<input v-for="i in items" :key="i.id" v-model="i">', '1:58-1:59'],
  ['VIBE2504', '<input v-model="label">', '1:27-1:32'],
  ['VIBE2505', '<input v-model="fixed">', '1:27-1:32'],
  ['VIBE2506', '<div v-model="text"></div>', '1:16-1:30'],
  ['VIBE2507', '<input :type="text" v-model="text">', '1:31-1:45'],
  ['VIBE2508', '<input type="file" v-model="text">', '1:30-1:44'],
  ['VIBE2509', '<input v-model:x="text">', '1:26-1:27'],
  ['VIBE2510', '<input v-model.foo="text">', '1:26-1:29'],
  ['VIBE2511', '<input :value="text" v-model="text">', '1:18-1:31'],
  ['VIBE2601', '<div v-slot></div>', '1:16-1:22'],
  ['VIBE2602', '<Item v-slot><template #a></template></Item>', '1:17-1:23'],
  ['VIBE2603', '<Item><template #a></template><template #a></template></Item>', '1:51-1:53'],
  ['VIBE2604', '<Item>x<template #default></template></Item>', '1:28-1:36'],
  ['VIBE2605', '<Item><template #[text]></template></Item>', '1:28-1:34'],
  ['VIBE2606', '<Item><template #a v-for="i in items"></template></Item>', '1:30-1:48'],
  ['VIBE2607', '<slot :name="text"></slot>', '1:17-1:29'],
  ['VIBE2608', '<slot @click="count++"></slot>', '1:17-1:33'],
  ['VIBE2701', '<div ref="nope"></div>', '1:16-1:26'],
  ['VIBE2702', '<div :ref="count++"></div>', '1:22-1:29'],
  ['VIBE2703', '<div v-html></div>', '1:16-1:22'],
  ['VIBE2704', '<div v-text="text">x</div>', '1:16-1:29'],
  ['VIBE2705', '<div v-show></div>', '1:16-1:22'],
  ['VIBE2706', '<Item v-show="text" />', '1:17-1:30'],
  ['VIBE2901', '<Teleport />', '1:12-1:20'],
  ['VIBE2902', '<KeepAlive />', '1:12-1:21'],
  ['VIBE2903', '<Transition />', '1:12-1:22'],
  ['VIBE2904', '<TransitionGroup />', '1:12-1:27'],
  ['VIBE2905', '<Suspense />', '1:12-1:20'],
  ['VIBE2906', '<div v-memo="[text]"></div>', '1:16-1:31'],
  ['VIBE2907', '<div v-once></div>', '1:16-1:22'],
  ['VIBE2908', '<div v-focus></div>', '1:16-1:23'],
  ['VIBE2909', '<div v-cloak></div>', '1:16-1:23'],
  ['VIBE2910', '<div @vue:mounted="count++"></div>', '1:16-1:38'],
  // UTF-16 columns: the emoji is two code units.
  ['VIBE2001', '<p>\u{1F600}</p><Missing />', '1:21-1:28'],
  // A CRLF line break is not part of a column.
  ['VIBE2003', '<p>\r\n</p><foo />', '2:6-2:9'],
];

describe('template diagnostics', () => {
  it.each(rows)('%s %j at %s', (code, template, range) => {
    const { diagnostics } = run(sfc(template));
    expect(diagnostics.map((d) => d.code)).toStrictEqual([code]);
    const [d] = diagnostics;
    const at = `${d.start.line}:${d.start.column}-${d.end.line}:${d.end.column}`;
    expect(at).toBe(range);
    expect(d.typeChecked).toBe(code === 'VIBE2001' ? true : undefined);
  });
});

describe('diagnostic variants', () => {
  it.each([
    ['<div><template #a></template></div>', ['VIBE2601']],
    ['<p v-bind></p>', ['VIBE2401']],
    ['<p :is="Local"></p>', ['VIBE2009']],
    ['<p v-on></p>', ['VIBE2301']],
    ['<input v-model="text +">', ['VIBE1201']],
    ['<p>{{ text + }}</p>', ['VIBE1201']],
    ['<div ref></div>', ['VIBE2701']],
    ['<div :ref></div>', ['VIBE2702']],
    ['<component :is="Local +" />', ['VIBE1201']],
    ['<component />', ['VIBE2006']],
    ['<component :is="`Item`" />', ['VIBE2006']],
    ['<Item is="x" :is="Local" />', ['VIBE2009', 'VIBE2009']],
    ['<Item v-text="text" v-html="text" />', ['VIBE2706', 'VIBE2706']],
    ['<template v-if="text" v-show="text"></template>', ['VIBE2706']],
    ['<Item v-bind />', ['VIBE2401']],
    ['<Item :a.prop="text" />', ['VIBE2402']],
    ['<Item @[text]="count++" />', ['VIBE2303']],
    ['<Item v-model:[text]="count" />', ['VIBE2509']],
    ['<Item v-model />', ['VIBE2501']],
    ['<Item v-once />', ['VIBE2907']],
    ['<Item><template #a v-if></template></Item>', ['VIBE2101']],
    ['<Item><template #a v-else-if></template></Item>', ['VIBE2102', 'VIBE2101']],
    [
      '<Item><template #a v-if="text"></template><template #b v-else="text"></template></Item>',
      ['VIBE2104'],
    ],
    ['<Item><template #a v-if="text"></template><template #a></template></Item>', ['VIBE2603']],
    ['<slot ref="box" />', ['VIBE2608']],
    ['<slot :ref="Form.set" v-bind />', ['VIBE2608', 'VIBE2401']],
    ['<slot :a.prop="text" v-show="text" />', ['VIBE2402', 'VIBE2706']],
    ['<p v-if="text" v-else></p>', []],
  ])('%s', (template, codes) => {
    const { ir, diagnostics } = run(sfc(template));
    expect(diagnostics.map((d) => d.code)).toStrictEqual(codes);
    expect(ir === null).toBe(codes.length > 0);
  });
});
