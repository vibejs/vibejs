import { defineRoutes } from '@usevibejs/ui/router';

// 300 routes (50 groups of 6) that mix every param syntax and nesting level. Odd groups have an
// unnamed parent, a regex with a modifier and a splat.
export const routes300 = defineRoutes([
  {
    path: '/s0/:id(\\d+)',
    name: 'r0',
    children: [
      { path: '', name: 'r0-index' },
      { path: 'opt/:opt?', name: 'r0-opt' },
      { path: 'many/:parts+', name: 'r0-many', children: [{ path: ':leaf', name: 'r0-leaf' }] },
      { path: '/abs0/:rest*', name: 'r0-abs' },
    ],
  },
  {
    path: '/s1/:id(\\d+)',
    children: [
      { path: '', name: 'r1-index' },
      { path: 'edit', name: 'r1-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r1-opt' },
      { path: 'many/:parts+', name: 'r1-many', children: [{ path: ':leaf', name: 'r1-leaf' }] },
      { path: '/abs1/:pathMatch(.*)*', name: 'r1-abs' },
    ],
  },
  {
    path: '/s2/:id(\\d+)',
    name: 'r2',
    children: [
      { path: '', name: 'r2-index' },
      { path: 'opt/:opt?', name: 'r2-opt' },
      { path: 'many/:parts+', name: 'r2-many', children: [{ path: ':leaf', name: 'r2-leaf' }] },
      { path: '/abs2/:rest*', name: 'r2-abs' },
    ],
  },
  {
    path: '/s3/:id(\\d+)',
    children: [
      { path: '', name: 'r3-index' },
      { path: 'edit', name: 'r3-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r3-opt' },
      { path: 'many/:parts+', name: 'r3-many', children: [{ path: ':leaf', name: 'r3-leaf' }] },
      { path: '/abs3/:pathMatch(.*)*', name: 'r3-abs' },
    ],
  },
  {
    path: '/s4/:id(\\d+)',
    name: 'r4',
    children: [
      { path: '', name: 'r4-index' },
      { path: 'opt/:opt?', name: 'r4-opt' },
      { path: 'many/:parts+', name: 'r4-many', children: [{ path: ':leaf', name: 'r4-leaf' }] },
      { path: '/abs4/:rest*', name: 'r4-abs' },
    ],
  },
  {
    path: '/s5/:id(\\d+)',
    children: [
      { path: '', name: 'r5-index' },
      { path: 'edit', name: 'r5-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r5-opt' },
      { path: 'many/:parts+', name: 'r5-many', children: [{ path: ':leaf', name: 'r5-leaf' }] },
      { path: '/abs5/:pathMatch(.*)*', name: 'r5-abs' },
    ],
  },
  {
    path: '/s6/:id(\\d+)',
    name: 'r6',
    children: [
      { path: '', name: 'r6-index' },
      { path: 'opt/:opt?', name: 'r6-opt' },
      { path: 'many/:parts+', name: 'r6-many', children: [{ path: ':leaf', name: 'r6-leaf' }] },
      { path: '/abs6/:rest*', name: 'r6-abs' },
    ],
  },
  {
    path: '/s7/:id(\\d+)',
    children: [
      { path: '', name: 'r7-index' },
      { path: 'edit', name: 'r7-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r7-opt' },
      { path: 'many/:parts+', name: 'r7-many', children: [{ path: ':leaf', name: 'r7-leaf' }] },
      { path: '/abs7/:pathMatch(.*)*', name: 'r7-abs' },
    ],
  },
  {
    path: '/s8/:id(\\d+)',
    name: 'r8',
    children: [
      { path: '', name: 'r8-index' },
      { path: 'opt/:opt?', name: 'r8-opt' },
      { path: 'many/:parts+', name: 'r8-many', children: [{ path: ':leaf', name: 'r8-leaf' }] },
      { path: '/abs8/:rest*', name: 'r8-abs' },
    ],
  },
  {
    path: '/s9/:id(\\d+)',
    children: [
      { path: '', name: 'r9-index' },
      { path: 'edit', name: 'r9-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r9-opt' },
      { path: 'many/:parts+', name: 'r9-many', children: [{ path: ':leaf', name: 'r9-leaf' }] },
      { path: '/abs9/:pathMatch(.*)*', name: 'r9-abs' },
    ],
  },
  {
    path: '/s10/:id(\\d+)',
    name: 'r10',
    children: [
      { path: '', name: 'r10-index' },
      { path: 'opt/:opt?', name: 'r10-opt' },
      { path: 'many/:parts+', name: 'r10-many', children: [{ path: ':leaf', name: 'r10-leaf' }] },
      { path: '/abs10/:rest*', name: 'r10-abs' },
    ],
  },
  {
    path: '/s11/:id(\\d+)',
    children: [
      { path: '', name: 'r11-index' },
      { path: 'edit', name: 'r11-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r11-opt' },
      { path: 'many/:parts+', name: 'r11-many', children: [{ path: ':leaf', name: 'r11-leaf' }] },
      { path: '/abs11/:pathMatch(.*)*', name: 'r11-abs' },
    ],
  },
  {
    path: '/s12/:id(\\d+)',
    name: 'r12',
    children: [
      { path: '', name: 'r12-index' },
      { path: 'opt/:opt?', name: 'r12-opt' },
      { path: 'many/:parts+', name: 'r12-many', children: [{ path: ':leaf', name: 'r12-leaf' }] },
      { path: '/abs12/:rest*', name: 'r12-abs' },
    ],
  },
  {
    path: '/s13/:id(\\d+)',
    children: [
      { path: '', name: 'r13-index' },
      { path: 'edit', name: 'r13-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r13-opt' },
      { path: 'many/:parts+', name: 'r13-many', children: [{ path: ':leaf', name: 'r13-leaf' }] },
      { path: '/abs13/:pathMatch(.*)*', name: 'r13-abs' },
    ],
  },
  {
    path: '/s14/:id(\\d+)',
    name: 'r14',
    children: [
      { path: '', name: 'r14-index' },
      { path: 'opt/:opt?', name: 'r14-opt' },
      { path: 'many/:parts+', name: 'r14-many', children: [{ path: ':leaf', name: 'r14-leaf' }] },
      { path: '/abs14/:rest*', name: 'r14-abs' },
    ],
  },
  {
    path: '/s15/:id(\\d+)',
    children: [
      { path: '', name: 'r15-index' },
      { path: 'edit', name: 'r15-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r15-opt' },
      { path: 'many/:parts+', name: 'r15-many', children: [{ path: ':leaf', name: 'r15-leaf' }] },
      { path: '/abs15/:pathMatch(.*)*', name: 'r15-abs' },
    ],
  },
  {
    path: '/s16/:id(\\d+)',
    name: 'r16',
    children: [
      { path: '', name: 'r16-index' },
      { path: 'opt/:opt?', name: 'r16-opt' },
      { path: 'many/:parts+', name: 'r16-many', children: [{ path: ':leaf', name: 'r16-leaf' }] },
      { path: '/abs16/:rest*', name: 'r16-abs' },
    ],
  },
  {
    path: '/s17/:id(\\d+)',
    children: [
      { path: '', name: 'r17-index' },
      { path: 'edit', name: 'r17-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r17-opt' },
      { path: 'many/:parts+', name: 'r17-many', children: [{ path: ':leaf', name: 'r17-leaf' }] },
      { path: '/abs17/:pathMatch(.*)*', name: 'r17-abs' },
    ],
  },
  {
    path: '/s18/:id(\\d+)',
    name: 'r18',
    children: [
      { path: '', name: 'r18-index' },
      { path: 'opt/:opt?', name: 'r18-opt' },
      { path: 'many/:parts+', name: 'r18-many', children: [{ path: ':leaf', name: 'r18-leaf' }] },
      { path: '/abs18/:rest*', name: 'r18-abs' },
    ],
  },
  {
    path: '/s19/:id(\\d+)',
    children: [
      { path: '', name: 'r19-index' },
      { path: 'edit', name: 'r19-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r19-opt' },
      { path: 'many/:parts+', name: 'r19-many', children: [{ path: ':leaf', name: 'r19-leaf' }] },
      { path: '/abs19/:pathMatch(.*)*', name: 'r19-abs' },
    ],
  },
  {
    path: '/s20/:id(\\d+)',
    name: 'r20',
    children: [
      { path: '', name: 'r20-index' },
      { path: 'opt/:opt?', name: 'r20-opt' },
      { path: 'many/:parts+', name: 'r20-many', children: [{ path: ':leaf', name: 'r20-leaf' }] },
      { path: '/abs20/:rest*', name: 'r20-abs' },
    ],
  },
  {
    path: '/s21/:id(\\d+)',
    children: [
      { path: '', name: 'r21-index' },
      { path: 'edit', name: 'r21-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r21-opt' },
      { path: 'many/:parts+', name: 'r21-many', children: [{ path: ':leaf', name: 'r21-leaf' }] },
      { path: '/abs21/:pathMatch(.*)*', name: 'r21-abs' },
    ],
  },
  {
    path: '/s22/:id(\\d+)',
    name: 'r22',
    children: [
      { path: '', name: 'r22-index' },
      { path: 'opt/:opt?', name: 'r22-opt' },
      { path: 'many/:parts+', name: 'r22-many', children: [{ path: ':leaf', name: 'r22-leaf' }] },
      { path: '/abs22/:rest*', name: 'r22-abs' },
    ],
  },
  {
    path: '/s23/:id(\\d+)',
    children: [
      { path: '', name: 'r23-index' },
      { path: 'edit', name: 'r23-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r23-opt' },
      { path: 'many/:parts+', name: 'r23-many', children: [{ path: ':leaf', name: 'r23-leaf' }] },
      { path: '/abs23/:pathMatch(.*)*', name: 'r23-abs' },
    ],
  },
  {
    path: '/s24/:id(\\d+)',
    name: 'r24',
    children: [
      { path: '', name: 'r24-index' },
      { path: 'opt/:opt?', name: 'r24-opt' },
      { path: 'many/:parts+', name: 'r24-many', children: [{ path: ':leaf', name: 'r24-leaf' }] },
      { path: '/abs24/:rest*', name: 'r24-abs' },
    ],
  },
  {
    path: '/s25/:id(\\d+)',
    children: [
      { path: '', name: 'r25-index' },
      { path: 'edit', name: 'r25-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r25-opt' },
      { path: 'many/:parts+', name: 'r25-many', children: [{ path: ':leaf', name: 'r25-leaf' }] },
      { path: '/abs25/:pathMatch(.*)*', name: 'r25-abs' },
    ],
  },
  {
    path: '/s26/:id(\\d+)',
    name: 'r26',
    children: [
      { path: '', name: 'r26-index' },
      { path: 'opt/:opt?', name: 'r26-opt' },
      { path: 'many/:parts+', name: 'r26-many', children: [{ path: ':leaf', name: 'r26-leaf' }] },
      { path: '/abs26/:rest*', name: 'r26-abs' },
    ],
  },
  {
    path: '/s27/:id(\\d+)',
    children: [
      { path: '', name: 'r27-index' },
      { path: 'edit', name: 'r27-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r27-opt' },
      { path: 'many/:parts+', name: 'r27-many', children: [{ path: ':leaf', name: 'r27-leaf' }] },
      { path: '/abs27/:pathMatch(.*)*', name: 'r27-abs' },
    ],
  },
  {
    path: '/s28/:id(\\d+)',
    name: 'r28',
    children: [
      { path: '', name: 'r28-index' },
      { path: 'opt/:opt?', name: 'r28-opt' },
      { path: 'many/:parts+', name: 'r28-many', children: [{ path: ':leaf', name: 'r28-leaf' }] },
      { path: '/abs28/:rest*', name: 'r28-abs' },
    ],
  },
  {
    path: '/s29/:id(\\d+)',
    children: [
      { path: '', name: 'r29-index' },
      { path: 'edit', name: 'r29-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r29-opt' },
      { path: 'many/:parts+', name: 'r29-many', children: [{ path: ':leaf', name: 'r29-leaf' }] },
      { path: '/abs29/:pathMatch(.*)*', name: 'r29-abs' },
    ],
  },
  {
    path: '/s30/:id(\\d+)',
    name: 'r30',
    children: [
      { path: '', name: 'r30-index' },
      { path: 'opt/:opt?', name: 'r30-opt' },
      { path: 'many/:parts+', name: 'r30-many', children: [{ path: ':leaf', name: 'r30-leaf' }] },
      { path: '/abs30/:rest*', name: 'r30-abs' },
    ],
  },
  {
    path: '/s31/:id(\\d+)',
    children: [
      { path: '', name: 'r31-index' },
      { path: 'edit', name: 'r31-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r31-opt' },
      { path: 'many/:parts+', name: 'r31-many', children: [{ path: ':leaf', name: 'r31-leaf' }] },
      { path: '/abs31/:pathMatch(.*)*', name: 'r31-abs' },
    ],
  },
  {
    path: '/s32/:id(\\d+)',
    name: 'r32',
    children: [
      { path: '', name: 'r32-index' },
      { path: 'opt/:opt?', name: 'r32-opt' },
      { path: 'many/:parts+', name: 'r32-many', children: [{ path: ':leaf', name: 'r32-leaf' }] },
      { path: '/abs32/:rest*', name: 'r32-abs' },
    ],
  },
  {
    path: '/s33/:id(\\d+)',
    children: [
      { path: '', name: 'r33-index' },
      { path: 'edit', name: 'r33-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r33-opt' },
      { path: 'many/:parts+', name: 'r33-many', children: [{ path: ':leaf', name: 'r33-leaf' }] },
      { path: '/abs33/:pathMatch(.*)*', name: 'r33-abs' },
    ],
  },
  {
    path: '/s34/:id(\\d+)',
    name: 'r34',
    children: [
      { path: '', name: 'r34-index' },
      { path: 'opt/:opt?', name: 'r34-opt' },
      { path: 'many/:parts+', name: 'r34-many', children: [{ path: ':leaf', name: 'r34-leaf' }] },
      { path: '/abs34/:rest*', name: 'r34-abs' },
    ],
  },
  {
    path: '/s35/:id(\\d+)',
    children: [
      { path: '', name: 'r35-index' },
      { path: 'edit', name: 'r35-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r35-opt' },
      { path: 'many/:parts+', name: 'r35-many', children: [{ path: ':leaf', name: 'r35-leaf' }] },
      { path: '/abs35/:pathMatch(.*)*', name: 'r35-abs' },
    ],
  },
  {
    path: '/s36/:id(\\d+)',
    name: 'r36',
    children: [
      { path: '', name: 'r36-index' },
      { path: 'opt/:opt?', name: 'r36-opt' },
      { path: 'many/:parts+', name: 'r36-many', children: [{ path: ':leaf', name: 'r36-leaf' }] },
      { path: '/abs36/:rest*', name: 'r36-abs' },
    ],
  },
  {
    path: '/s37/:id(\\d+)',
    children: [
      { path: '', name: 'r37-index' },
      { path: 'edit', name: 'r37-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r37-opt' },
      { path: 'many/:parts+', name: 'r37-many', children: [{ path: ':leaf', name: 'r37-leaf' }] },
      { path: '/abs37/:pathMatch(.*)*', name: 'r37-abs' },
    ],
  },
  {
    path: '/s38/:id(\\d+)',
    name: 'r38',
    children: [
      { path: '', name: 'r38-index' },
      { path: 'opt/:opt?', name: 'r38-opt' },
      { path: 'many/:parts+', name: 'r38-many', children: [{ path: ':leaf', name: 'r38-leaf' }] },
      { path: '/abs38/:rest*', name: 'r38-abs' },
    ],
  },
  {
    path: '/s39/:id(\\d+)',
    children: [
      { path: '', name: 'r39-index' },
      { path: 'edit', name: 'r39-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r39-opt' },
      { path: 'many/:parts+', name: 'r39-many', children: [{ path: ':leaf', name: 'r39-leaf' }] },
      { path: '/abs39/:pathMatch(.*)*', name: 'r39-abs' },
    ],
  },
  {
    path: '/s40/:id(\\d+)',
    name: 'r40',
    children: [
      { path: '', name: 'r40-index' },
      { path: 'opt/:opt?', name: 'r40-opt' },
      { path: 'many/:parts+', name: 'r40-many', children: [{ path: ':leaf', name: 'r40-leaf' }] },
      { path: '/abs40/:rest*', name: 'r40-abs' },
    ],
  },
  {
    path: '/s41/:id(\\d+)',
    children: [
      { path: '', name: 'r41-index' },
      { path: 'edit', name: 'r41-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r41-opt' },
      { path: 'many/:parts+', name: 'r41-many', children: [{ path: ':leaf', name: 'r41-leaf' }] },
      { path: '/abs41/:pathMatch(.*)*', name: 'r41-abs' },
    ],
  },
  {
    path: '/s42/:id(\\d+)',
    name: 'r42',
    children: [
      { path: '', name: 'r42-index' },
      { path: 'opt/:opt?', name: 'r42-opt' },
      { path: 'many/:parts+', name: 'r42-many', children: [{ path: ':leaf', name: 'r42-leaf' }] },
      { path: '/abs42/:rest*', name: 'r42-abs' },
    ],
  },
  {
    path: '/s43/:id(\\d+)',
    children: [
      { path: '', name: 'r43-index' },
      { path: 'edit', name: 'r43-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r43-opt' },
      { path: 'many/:parts+', name: 'r43-many', children: [{ path: ':leaf', name: 'r43-leaf' }] },
      { path: '/abs43/:pathMatch(.*)*', name: 'r43-abs' },
    ],
  },
  {
    path: '/s44/:id(\\d+)',
    name: 'r44',
    children: [
      { path: '', name: 'r44-index' },
      { path: 'opt/:opt?', name: 'r44-opt' },
      { path: 'many/:parts+', name: 'r44-many', children: [{ path: ':leaf', name: 'r44-leaf' }] },
      { path: '/abs44/:rest*', name: 'r44-abs' },
    ],
  },
  {
    path: '/s45/:id(\\d+)',
    children: [
      { path: '', name: 'r45-index' },
      { path: 'edit', name: 'r45-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r45-opt' },
      { path: 'many/:parts+', name: 'r45-many', children: [{ path: ':leaf', name: 'r45-leaf' }] },
      { path: '/abs45/:pathMatch(.*)*', name: 'r45-abs' },
    ],
  },
  {
    path: '/s46/:id(\\d+)',
    name: 'r46',
    children: [
      { path: '', name: 'r46-index' },
      { path: 'opt/:opt?', name: 'r46-opt' },
      { path: 'many/:parts+', name: 'r46-many', children: [{ path: ':leaf', name: 'r46-leaf' }] },
      { path: '/abs46/:rest*', name: 'r46-abs' },
    ],
  },
  {
    path: '/s47/:id(\\d+)',
    children: [
      { path: '', name: 'r47-index' },
      { path: 'edit', name: 'r47-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r47-opt' },
      { path: 'many/:parts+', name: 'r47-many', children: [{ path: ':leaf', name: 'r47-leaf' }] },
      { path: '/abs47/:pathMatch(.*)*', name: 'r47-abs' },
    ],
  },
  {
    path: '/s48/:id(\\d+)',
    name: 'r48',
    children: [
      { path: '', name: 'r48-index' },
      { path: 'opt/:opt?', name: 'r48-opt' },
      { path: 'many/:parts+', name: 'r48-many', children: [{ path: ':leaf', name: 'r48-leaf' }] },
      { path: '/abs48/:rest*', name: 'r48-abs' },
    ],
  },
  {
    path: '/s49/:id(\\d+)',
    children: [
      { path: '', name: 'r49-index' },
      { path: 'edit', name: 'r49-edit' },
      { path: 'opt/:opt(\\d+)?', name: 'r49-opt' },
      { path: 'many/:parts+', name: 'r49-many', children: [{ path: ':leaf', name: 'r49-leaf' }] },
      { path: '/abs49/:pathMatch(.*)*', name: 'r49-abs' },
    ],
  },
]);
