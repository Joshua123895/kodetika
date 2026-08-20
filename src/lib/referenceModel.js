// Shapes the hand-written reference (src/data/reference.yaml) for the handbook
// pages. Pure: takes the parsed YAML as an argument, so the rules are testable
// in node without Vite's ?raw import (the same split levelSource.js documents).

import { parseInline, parseRichText } from "../data/richText";

/** Topics with descriptions parsed to segments and search text extracted. */
export function buildReference(data) {
  const topics = (data.topics || []).map((topic) => ({
    slug: topic.slug,
    name: topic.name,
    blurb: topic.blurb || "",
    groups: (topic.groups || []).map((group) => ({
      name: group.name,
      entries: (group.entries || []).map((e) => ({
        sig: String(e.sig),
        // Ready-made block lists, so the pages hand them straight to RichText:
        // the desc as one paragraph (backticks become code, same dialect as
        // levels), the example as a code block.
        descBlocks: [{ type: "para", segments: parseInline(String(e.desc)) }],
        exBlocks: e.ex != null ? [{ type: "codeblock", value: String(e.ex) }] : null,
        _text: `${e.sig} ${e.desc} ${e.ex ?? ""}`.toLowerCase(),
      })),
    })),
  }));

  const guides = (data.guides || []).map((g) => ({
    slug: g.slug,
    name: g.name,
    blurb: g.blurb || "",
    blocks: parseRichText(String(g.body || "")),
  }));

  return { topics, guides };
}

/**
 * One topic narrowed to the entries mentioning `query` in signature, prose or
 * example. Groups that lose everything disappear; a blank query is the topic
 * untouched. The same contract filterHandbook keeps for the concept pages.
 */
export function filterTopic(topic, query) {
  const q = query.trim().toLowerCase();
  if (!q) return topic;
  const groups = topic.groups
    .map((g) => ({ ...g, entries: g.entries.filter((e) => e._text.includes(q)) }))
    .filter((g) => g.entries.length > 0);
  return { ...topic, groups };
}

/** How many entries a topic holds, for the index cards. */
export function topicCount(topic) {
  return topic.groups.reduce((n, g) => n + g.entries.length, 0);
}
