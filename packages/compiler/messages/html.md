# HTML syntax

These codes report template markup that the HTML parser cannot read as written. Each entry names the HTML parse error, or the template rule, it reports. The parser recovers and keeps going, so one mistake can be followed by others that disappear once it is fixed.

## VIBE1101: CDATA section in HTML

> A CDATA section `<![CDATA[ ]]>` is allowed only inside `<svg>` or `<math>`.

This is the HTML parse error `cdata-in-html-content`. In HTML content, the browser reads a CDATA section as a comment, so its text is dropped.

### Fix

- Write the text without `<![CDATA[` and `]]>`, escaping `<` as `&lt;` and `&` as `&amp;`.
- Move the CDATA section inside an `<svg>` or `<math>` element.

## VIBE1102: Duplicate attribute

> The attribute `{name}` appears more than once on this element.

This is the HTML parse error `duplicate-attribute`. An element has each attribute at most once.

### Fix

- Remove the second `{name}`.
- Merge both values into one `{name}` attribute.

## VIBE1105: End of file after `<`

> The file ends after `<` before a tag name.

This is the HTML parse error `eof-before-tag-name`.

### Fix

- Complete the tag, as in `<div>`.
- Write `&lt;` for a literal `<`.

## VIBE1106: End of file in a CDATA section

> The file ends inside a CDATA section that has no `]]>`.

This is the HTML parse error `eof-in-cdata`.

### Fix

- Close the CDATA section with `]]>`.

## VIBE1107: End of file in a comment

> The file ends inside a comment that has no `-->`.

This is the HTML parse error `eof-in-comment`. Everything after `<!--` became part of the comment.

### Fix

- Close the comment with `-->`.

## VIBE1109: End of file in a tag

> The file ends inside a tag that has no `>`.

This is the HTML parse error `eof-in-tag`. The unfinished tag is dropped.

### Fix

- Close the tag with `>`.
- Close the quote of the last attribute value.

## VIBE1113: Missing attribute value

> The attribute `{name}` has `=` but no value.

This is the HTML parse error `missing-attribute-value`.

### Fix

- Write the value after `=`, as in `{name}="value"`.
- Remove `=` for an attribute without a value.

## VIBE1114: End tag without a name

> `</>` is an end tag without a tag name.

This is the HTML parse error `missing-end-tag-name`. The parser ignores it.

### Fix

- Write the name of the element to close, as in `</div>`.
- Remove `</>`.

## VIBE1117: Unexpected character in an attribute name

> The attribute name contains `{char}`, which is not allowed in attribute names.

This is the HTML parse error `unexpected-character-in-attribute-name`. Attribute names cannot contain `"`, `'` or `<`; the character is often a missing `=` or a missing space.

### Fix

- Add the missing `=` before the quote of the value.
- Add a space between two attributes.

## VIBE1118: Unexpected character in an unquoted attribute value

> The unquoted attribute value contains `{char}`.

This is the HTML parse error `unexpected-character-in-unquoted-attribute-value`. Unquoted values cannot contain `"`, `'`, `<`, `=` or `` ` ``.

### Fix

- Quote the value, as in `name="value"`.

## VIBE1119: Attribute name starting with `=`

> An attribute name starts with `=`.

This is the HTML parse error `unexpected-equals-sign-before-attribute-name`. The `=` has no attribute name before it.

### Fix

- Write the attribute name before `=`, as in `id="main"`.
- Remove the extra `=`.

## VIBE1121: Processing instruction in HTML

> `<?` is allowed only inside `<svg>` or `<math>`.

This is the HTML parse error `unexpected-question-mark-instead-of-tag-name`. In HTML content, the browser reads `<?…>` as a comment.

### Fix

- Remove the `<?…>` instruction, such as an XML declaration.
- Write `&lt;?` for literal text.

## VIBE1122: Unexpected `/` in a tag

> A `/` inside a tag is not followed by `>`.

This is the HTML parse error `unexpected-solidus-in-tag`. Only a self-closing tag ends with `/>`.

### Fix

- Write `/>` with no space between `/` and `>`.
- Remove the `/`, or quote the attribute value that contains it.

## VIBE1123: End tag without a start tag

> The end tag `</{tag}>` has no matching start tag.

No open element is named `{tag}`, so the parser ignores the end tag. The start tag may be misspelled, or the element may already be closed.

### Fix

- Remove `</{tag}>`.
- Add the missing `<{tag}>` start tag, or fix the spelling of the end tag.

## VIBE1124: Element without an end tag

> The element `<{tag}>` has no end tag.

The element is closed when an outer element closes or at the end of the file, so its content may extend further than intended.

### Fix

- Add `</{tag}>` where the element ends.
- Write `<{tag} />` for an element without content.

## VIBE1125: Unclosed interpolation

> An interpolation has no closing braces.

Everything after the opening double braces, up to the end of the parent element, became part of the expression.

### Fix

- Close the interpolation with two closing braces after the expression.
- Wrap the text in `<span v-pre>` to show the braces as literal text.

## VIBE1126: Directive without a name

> The attribute `{name}` is a directive without a name.

An attribute that starts with `v-` names a directive, as in `v-if` or `v-for`.

### Fix

- Write the directive name after `v-`, as in `v-if="ok"`.
- Remove the attribute.

## VIBE1127: Dynamic argument without `]`

> The dynamic argument has no closing `]`.

A dynamic argument is written `:[name]="value"`, and it cannot contain spaces.

### Fix

- Close the argument with `]`.
- Remove the spaces from the argument, or compute the name in the script.
