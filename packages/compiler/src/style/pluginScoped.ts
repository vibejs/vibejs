// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/compiler-sfc/src/style/pluginScoped.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits:
// - The scope attribute is `[data-vb-<id>]` and keyframe names get the suffix `-<id>`, where `id`
//   is the component's 8-hex id. The plugin is named `vibe-scoped`; `pluginScoped` is a named
//   function that returns the plugin object.
// - The `::v-deep`, `::v-slotted`, `:slotted` and `::v-global` pseudos, the `>>>` and `/deep/`
//   combinators and the argument-less `::v-deep` combinator form are deleted: the parser rejects
//   them before a style block reaches this plugin.
// - A `:deep` or `:global` without exactly one non-empty selector argument is passed to
//   `onMalformed` with its offsets in the input CSS, and its rule is left as it is. Selectors are
//   checked through the rule, so a selector syntax error is a CssSyntaxError at its position.
// - An empty selector, such as the middle one of `.a, , .b` or the argument of `:is()`, is left
//   as it is, where upstream throws a TypeError.
// - Types for erasableSyntaxOnly and isolatedDeclarations. The deep-rule marker is a WeakSet of
//   `raws` objects, which a node shares with its visitor proxy.
/* oxlint-disable eslint/no-shadow, typescript/consistent-return -- kept as upstream writes it */
import { type AtRule, type Container, type Document, type Plugin, Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';

/** Called with the escape (`:deep` or `:global`) and its [start, end) offsets in the input CSS. */
export type OnMalformed = (escape: string, start: number, end: number) => void;

const animationNameRE = /^(?:-\w+-)?animation-name$/;
const animationRE = /^(?:-\w+-)?animation$/;
const keyframesRE = /^(?:-\w+-)?keyframes$/;

/** Scopes the rules of one style block to the component with the 8-hex `id`. */
export function pluginScoped(id: string, onMalformed: OnMalformed): Plugin {
  const keyframes: Record<string, string> = Object.create(null);
  const attribute = `data-vb-${id}`;

  return {
    postcssPlugin: 'vibe-scoped',
    Rule(rule) {
      processRule(attribute, rule, onMalformed);
    },
    AtRule(node) {
      if (keyframesRE.test(node.name) && !node.params.endsWith(`-${id}`)) {
        // register keyframes
        keyframes[node.params] = node.params = node.params + '-' + id;
      }
    },
    OnceExit(root) {
      if (Object.keys(keyframes).length) {
        // If keyframes are found in this <style>, find and rewrite animation names
        // in declarations.
        // Caveat: this only works for keyframes and animation rules in the same
        // <style> element.
        // individual animation-name declaration
        root.walkDecls((decl) => {
          if (animationNameRE.test(decl.prop)) {
            decl.value = decl.value
              .split(',')
              .map((v) => keyframes[v.trim()] || v.trim())
              .join(',');
          }
          // shorthand
          if (animationRE.test(decl.prop)) {
            decl.value = decl.value
              .split(',')
              .map((v) => {
                const vals = v.trim().split(/\s+/);
                const i = vals.findIndex((val) => keyframes[val]);
                if (i !== -1) {
                  vals.splice(i, 1, keyframes[vals[i]]);
                  return vals.join(' ');
                } else {
                  return v;
                }
              })
              .join(',');
          }
        });
      }
    },
  };
}

const processedRules = new WeakSet<Rule>();
const deepRules = new WeakSet<object>();

function processRule(id: string, rule: Rule, onMalformed: OnMalformed): void {
  if (
    processedRules.has(rule) ||
    (rule.parent && rule.parent.type === 'atrule' && keyframesRE.test((rule.parent as AtRule).name))
  ) {
    return;
  }
  processedRules.add(rule);
  if (reportMalformed(rule, onMalformed)) return;
  let deep = false;
  let parent: Document | Container | undefined = rule.parent;
  while (parent && parent.type !== 'root') {
    if (deepRules.has(parent.raws)) {
      deep = true;
      break;
    }
    parent = parent.parent;
  }
  rule.selector = selectorParser((selectorRoot) => {
    selectorRoot.each((selector) => {
      rewriteSelector(id, rule, selector, selectorRoot, deep);
    });
  }).processSync(rule.selector);
}

/** Reports every malformed `:deep` or `:global` in the selector of `rule`; true if there is one. */
function reportMalformed(rule: Rule, onMalformed: OnMalformed): boolean {
  // The source text of the selector, comments included, so that indexes are input offsets.
  const selector = rule.raws.selector?.raw ?? rule.selector;
  let malformed = false;
  selectorParser((root) => {
    root.walkPseudos((pseudo) => {
      const { value, nodes } = pseudo;
      if (value !== ':deep' && value !== ':global') return;
      if (nodes.length === 1 && nodes[0].nodes.length > 0) return;
      malformed = true;
      // `source.end` is the 1-based line and column of the last character in `selector`.
      const { line, column } = pseudo.source!.end!;
      let lineStart = 0;
      for (let l = 1; l < line; l++) lineStart = selector.indexOf('\n', lineStart) + 1;
      const offset = rule.source!.start!.offset;
      onMalformed(value, offset + pseudo.sourceIndex, offset + lineStart + column);
    });
  }).processSync(
    { selector, error: (message, options) => rule.error(message, options) },
    { updateSelector: false },
  );
  return malformed;
}

function rewriteSelector(
  id: string,
  rule: Rule,
  selector: selectorParser.Selector,
  selectorRoot: selectorParser.Root,
  deep: boolean,
): void {
  // An empty selector (`.a, , .b` or `:is()`) has nothing to scope.
  if (!selector.length) return;
  let node = null as selectorParser.Selector['nodes'][0] | null;
  let shouldInject = !deep;
  let hasNestedDeep = false as boolean;
  let splitForNestedDeep = false as boolean;
  // find the last child node to insert attribute selector
  selector.each((n) => {
    if (n.type === 'pseudo') {
      const { value } = n;
      if (isDeepContainerPseudo(n)) {
        const hasDeepSelectors = n.nodes.some((selector) => selector.some(isDeepSelector));
        if (hasDeepSelectors) {
          const hasScopeAnchor = !!node;
          const hasMixedSelectors = n.nodes.some((selector) => !selector.some(isDeepSelector));
          const hasTrailingNodes = selector.index(n) < selector.length - 1;
          if (
            canSplitDeepContainerPseudo(n) &&
            !deep &&
            !hasScopeAnchor &&
            hasMixedSelectors &&
            hasTrailingNodes
          ) {
            splitSelectorForNestedDeep(id, rule, selector, selectorRoot, n, deep);
            splitForNestedDeep = true;
            return false;
          }

          if (
            value === ':not' &&
            !deep &&
            !hasScopeAnchor &&
            hasMixedSelectors &&
            hasTrailingNodes
          ) {
            return;
          }

          n.nodes.forEach((selector) =>
            rewriteSelector(id, rule, selector, selectorRoot, deep || hasScopeAnchor),
          );
          if (!hasScopeAnchor) {
            node = n;
            shouldInject = false;
          }
          hasNestedDeep = true;
        }
      }

      // deep: inject [id] attribute at the node before the :deep.
      if (value === ':deep') {
        deepRules.add(rule.raws);
        // .foo :deep(.bar) -> .foo[xxxxxxx] .bar
        // replace the current node with :deep's inner selector
        let last: selectorParser.Selector['nodes'][0] = n;
        n.nodes[0].each((ss) => {
          selector.insertAfter(last, ss);
          last = ss;
        });
        // insert a space combinator before if it doesn't already have one
        const prev = selector.at(selector.index(n) - 1) as selectorParser.Node | undefined;
        if (!prev || !isSpaceCombinator(prev)) {
          selector.insertAfter(
            n,
            selectorParser.combinator({
              value: ' ',
            }),
          );
        }
        selector.removeChild(n);
        return false;
      }

      // global: replace with inner selector and do not inject [id].
      // :global(.foo) -> .foo
      if (value === ':global') {
        selector.replaceWith(n.nodes[0]);
        return false;
      }
    }

    if (n.type === 'universal') {
      const prev = selector.at(selector.index(n) - 1) as selectorParser.Node | undefined;
      const next = selector.at(selector.index(n) + 1) as selectorParser.Node | undefined;
      // * ... {}
      if (!prev) {
        // * .foo {} -> .foo[xxxxxxx] {}
        if (next) {
          if (next.type === 'combinator' && next.value === ' ') {
            selector.removeChild(next);
          }
          selector.removeChild(n);
          return;
        } else {
          // * {} -> [xxxxxxx] {}
          node = selectorParser.combinator({
            value: '',
          });
          selector.insertBefore(n, node);
          selector.removeChild(n);
          return false;
        }
      }
      // .foo * -> .foo[xxxxxxx] *
      if (node) return;
    }

    if (
      !hasNestedDeep &&
      ((n.type !== 'pseudo' && n.type !== 'combinator') ||
        (n.type === 'pseudo' && (n.value === ':is' || n.value === ':where') && !node))
    ) {
      node = n;
    }
  });

  if (splitForNestedDeep) {
    return;
  }

  if (rule.nodes.some((node) => node.type === 'rule')) {
    const deep = deepRules.has(rule.raws);
    if (!deep) {
      extractAndWrapNodes(rule);
      const atruleNodes = rule.nodes.filter((node) => node.type === 'atrule');
      for (const atnode of atruleNodes) {
        extractAndWrapNodes(atnode);
      }
    }
    shouldInject = deep;
  }

  if (node && !hasNestedDeep) {
    const { type, value } = node;
    if (type === 'pseudo' && (value === ':is' || value === ':where')) {
      node.nodes.forEach((value) => rewriteSelector(id, rule, value, selectorRoot, deep));
      shouldInject = false;
    }
  }

  if (node) {
    node.spaces.after = '';
  } else {
    // For deep selectors & standalone pseudo selectors,
    // the attribute selectors are prepended rather than appended.
    // So all leading spaces must be eliminated to avoid problems.
    selector.first.spaces.before = '';
  }

  if (shouldInject) {
    selector.insertAfter(
      // If node is null it means we need to inject [id] at the start
      // insertAfter can handle `null` here
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
      node as selectorParser.Selector['nodes'][0],
      selectorParser.attribute({
        attribute: id,
        value: id,
        raws: {},
        quoteMark: `"`,
      }),
    );
  }
}

function isSpaceCombinator(node: selectorParser.Node): boolean {
  return node.type === 'combinator' && /^\s+$/.test(node.value);
}

function isDeepSelector(node: selectorParser.Node): boolean {
  if (node.type === 'pseudo' && node.value === ':deep') {
    return true;
  }

  return !!(node as selectorParser.Node & { nodes?: selectorParser.Node[] }).nodes?.some((child) =>
    isDeepSelector(child),
  );
}

function isDeepContainerPseudo(node: selectorParser.Node): node is selectorParser.Pseudo {
  return (
    node.type === 'pseudo' &&
    (node.value === ':is' ||
      node.value === ':where' ||
      node.value === ':has' ||
      node.value === ':not')
  );
}

function canSplitDeepContainerPseudo(node: selectorParser.Pseudo): boolean {
  return node.value === ':is' || node.value === ':where' || node.value === ':has';
}

function splitSelectorForNestedDeep(
  id: string,
  rule: Rule,
  selector: selectorParser.Selector,
  selectorRoot: selectorParser.Root,
  pseudo: selectorParser.Pseudo,
  deep: boolean,
): void {
  const pseudoIndex = selector.index(pseudo);
  const selectors = pseudo.nodes.map((branch, index) => {
    const branchSelector = selector.clone();
    // oxlint-disable typescript/no-unnecessary-condition -- the upstream check of the hint below
    /* v8 ignore else -- @preserve upstream-defensive: a clone of a selector that holds the pseudo has a first node */
    if (branchSelector.first) {
      branchSelector.first.spaces.before = index === 0 ? selector.first.spaces.before : ' ';
    }
    // oxlint-enable typescript/no-unnecessary-condition
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the clone holds the pseudo at the same index
    const branchPseudo = branchSelector.at(pseudoIndex) as selectorParser.Pseudo;
    const branchClone = branch.clone();
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- an empty branch, as in `:is(:deep(.a), ) .b`, has no first node
    if (branchClone.first) {
      branchClone.first.spaces.before = '';
    }
    branchPseudo.removeAll();
    branchPseudo.append(branchClone);
    rewriteSelector(id, rule, branchSelector, selectorRoot, deep);
    return branchSelector;
  });

  selector.replaceWith(...selectors);
}

function extractAndWrapNodes(parentNode: Rule | AtRule): void {
  if (!parentNode.nodes) return;
  const nodes = parentNode.nodes.filter((node) => node.type === 'decl' || node.type === 'comment');
  if (nodes.length) {
    for (const node of nodes) {
      parentNode.removeChild(node);
    }
    const wrappedRule = new Rule({
      nodes: nodes,
      selector: '&',
    });
    parentNode.prepend(wrappedRule);
  }
}
