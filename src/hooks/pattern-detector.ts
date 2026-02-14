/**
 * Pattern Detector
 *
 * Analyzes text content to detect patterns worth remembering.
 * Inspired by mcp-memory-service's Smart Auto-Capture,
 * but works across all agents via the unified hooks system.
 */

import type { DetectedPattern, PatternType } from './types.js';

/** Minimum content length to consider for pattern detection */
const MIN_CONTENT_LENGTH = 100;

/** Pattern definitions with multilingual keywords */
const PATTERNS: Array<{
  type: PatternType;
  keywords: RegExp[];
  minLength: number;
  baseConfidence: number;
}> = [
  {
    type: 'decision',
    keywords: [
      /\b(decided|chose|will use|settled on|going with|picked|selected)\b/i,
      /(决定|选择了|采用|确定用|最终选了)/,
      /\b(architecture|approach|strategy|pattern|framework)\b/i,
    ],
    minLength: 100,
    baseConfidence: 0.8,
  },
  {
    type: 'error',
    keywords: [
      /\b(error|bug|fix(ed)?|resolv(ed|ing)|crash|fail(ed|ure)?|broken)\b/i,
      /(错误|修复|报错|崩溃|失败|异常|解决了)/,
      /\b(workaround|hotfix|patch|regression|stack\s*trace)\b/i,
    ],
    minLength: 100,
    baseConfidence: 0.75,
  },
  {
    type: 'gotcha',
    keywords: [
      /\b(gotcha|pitfall|trap|caveat|watch out|careful|beware|warning)\b/i,
      /(坑|注意|陷阱|小心|踩坑|坑点)/,
      /\b(don'?t|never|avoid|must not|不要|千万别|切记)\b/i,
    ],
    minLength: 80,
    baseConfidence: 0.85,
  },
  {
    type: 'configuration',
    keywords: [
      /\b(config(ured?|uration)?|setting|environment|\.env)\b/i,
      /(配置|环境变量|端口配置|设置项|安装配置)/,
      /\b(gradle|webpack|vite|tsconfig|package\.json|docker|nginx)\b/i,
      /\b(port\s*[:=]|listen\s+\d|bind\s+\d|DATABASE_URL|API_KEY)\b/i,
    ],
    minLength: 80,
    baseConfidence: 0.7,
  },
  {
    type: 'learning',
    keywords: [
      /\b(learn(ed)?|discover(ed)?|realiz(ed)?|turns?\s*out|found\s*out|TIL)\b/i,
      /(学到|发现|原来|才知道|了解到)/,
      /\b(insight|understanding|clarif(ied|ication))\b/i,
    ],
    minLength: 150,
    baseConfidence: 0.65,
  },
  {
    type: 'implementation',
    keywords: [
      /\b(implement(ed)?|creat(ed|ing)|built|added|integrat(ed|ing))\b/i,
      /(实现了|创建了|添加了|集成了|完成了)/,
      /\b(refactor(ed)?|migrat(ed|ing)|upgrad(ed|ing))\b/i,
    ],
    minLength: 200,
    baseConfidence: 0.5,
  },
];

/**
 * Detect patterns in text content.
 * Returns matched patterns sorted by confidence (highest first).
 */
export function detectPatterns(content: string): DetectedPattern[] {
  if (!content || content.length < MIN_CONTENT_LENGTH) {
    return [];
  }

  const results: DetectedPattern[] = [];

  for (const pattern of PATTERNS) {
    if (content.length < pattern.minLength) continue;

    const matchedKeywords: string[] = [];
    let matchCount = 0;

    for (const regex of pattern.keywords) {
      const matches = content.match(new RegExp(regex.source, regex.flags + 'g'));
      if (matches) {
        matchCount += matches.length;
        matchedKeywords.push(...matches.map((m) => m.trim()));
      }
    }

    if (matchCount > 0) {
      // Confidence increases with more keyword matches (up to 1.0)
      const confidence = Math.min(1.0, pattern.baseConfidence + matchCount * 0.05);
      results.push({
        type: pattern.type,
        confidence,
        matchedKeywords: [...new Set(matchedKeywords)].slice(0, 5),
      });
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Get the best (highest confidence) pattern from content.
 * Returns null if no pattern is detected or confidence is too low.
 */
export function detectBestPattern(
  content: string,
  minConfidence = 0.5,
): DetectedPattern | null {
  const patterns = detectPatterns(content);
  if (patterns.length === 0) return null;
  if (patterns[0].confidence < minConfidence) return null;
  return patterns[0];
}

/**
 * Map pattern type → Memorix observation type.
 */
export function patternToObservationType(
  pattern: PatternType,
): string {
  const map: Record<PatternType, string> = {
    decision: 'decision',
    error: 'problem-solution',
    gotcha: 'gotcha',
    configuration: 'what-changed',
    learning: 'discovery',
    implementation: 'what-changed',
  };
  return map[pattern] ?? 'discovery';
}
