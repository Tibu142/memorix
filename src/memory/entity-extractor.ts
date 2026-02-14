/**
 * Entity Extractor
 *
 * Regex-based entity extraction from observation content.
 * Inspired by MemCP's RegexEntityExtractor (MAGMA paper).
 *
 * Extracts: file paths, module paths, URLs, @mentions, CamelCase identifiers.
 * Also detects causal patterns for automatic edge typing.
 */

const ENTITY_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  // File paths (e.g. src/auth/jwt.ts, ./config.json)
  { kind: 'file', pattern: /(?:^|[\s"'(])([.\w/-]+\.\w{1,10})(?:[\s"'),]|$)/g },
  // Module/package paths (e.g. @orama/orama, memcp.core.graph)
  { kind: 'module', pattern: /(?:^|[\s"'(,])(@[\w-]+\/[\w.-]+)|\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*){2,})\b/g },
  // URLs
  { kind: 'url', pattern: /https?:\/\/[^\s"'<>)]+/g },
  // @mentions
  { kind: 'mention', pattern: /@([a-zA-Z_]\w+)/g },
  // CamelCase identifiers (likely class/type names)
  { kind: 'identifier', pattern: /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g },
];

/**
 * Patterns that indicate causal relationships.
 * Used to auto-detect causal edge types in Knowledge Graph.
 */
const CAUSAL_PATTERN = /\b(?:because|therefore|due to|caused by|as a result|decided to|chosen because|so that|in order to|leads to|results in|fixed by|resolved by)\b/i;

export interface ExtractedEntities {
  files: string[];
  modules: string[];
  urls: string[];
  mentions: string[];
  identifiers: string[];
  hasCausalLanguage: boolean;
}

/**
 * Extract entities from text content.
 * Returns deduplicated lists of each entity type.
 */
export function extractEntities(content: string): ExtractedEntities {
  const result: ExtractedEntities = {
    files: [],
    modules: [],
    urls: [],
    mentions: [],
    identifiers: [],
    hasCausalLanguage: false,
  };

  const seen = new Set<string>();

  for (const { kind, pattern } of ENTITY_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const entity = (match[1] ?? match[2] ?? match[0]).trim().replace(/^["'(]+|["'),]+$/g, '');
      if (entity.length < 3 || (kind === 'file' && entity.length < 5)) continue;

      const key = `${kind}:${entity.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      switch (kind) {
        case 'file':
          result.files.push(entity);
          break;
        case 'module':
          result.modules.push(entity);
          break;
        case 'url':
          result.urls.push(entity);
          break;
        case 'mention':
          result.mentions.push(entity);
          break;
        case 'identifier':
          result.identifiers.push(entity);
          break;
      }
    }
  }

  result.hasCausalLanguage = CAUSAL_PATTERN.test(content);

  return result;
}

/**
 * Auto-generate concepts from extracted entities.
 * Merges with any user-provided concepts.
 */
export function enrichConcepts(
  userConcepts: string[],
  extracted: ExtractedEntities,
): string[] {
  const all = new Set(userConcepts.map((c) => c.toLowerCase()));
  const enriched = [...userConcepts];

  // Add file names (without path) as concepts
  for (const f of extracted.files) {
    const name = f.split('/').pop()?.replace(/\.\w+$/, '') ?? '';
    if (name.length >= 3 && !all.has(name.toLowerCase())) {
      all.add(name.toLowerCase());
      enriched.push(name);
    }
  }

  // Add module names as concepts
  for (const m of extracted.modules) {
    const short = m.split(/[./]/).pop() ?? '';
    if (short.length >= 3 && !all.has(short.toLowerCase())) {
      all.add(short.toLowerCase());
      enriched.push(short);
    }
  }

  // Add CamelCase identifiers as concepts
  for (const id of extracted.identifiers) {
    if (!all.has(id.toLowerCase())) {
      all.add(id.toLowerCase());
      enriched.push(id);
    }
  }

  return enriched;
}
