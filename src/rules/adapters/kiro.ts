/**
 * Kiro Rule Format Adapter
 *
 * Parses and generates rules in Kiro's formats:
 * - .kiro/steering/*.md (Markdown steering rules with optional frontmatter)
 * - AGENTS.md (always included, pure Markdown)
 *
 * Source: Kiro official documentation on Steering Rules.
 * Kiro uses ".kiro/steering/" for project-level rules
 * and "~/.kiro/steering/" for user-level (global) rules.
 */

import matter from 'gray-matter';
import type { RuleFormatAdapter, UnifiedRule, RuleSource } from '../../types.js';
import { hashContent, generateRuleId } from '../utils.js';

export class KiroAdapter implements RuleFormatAdapter {
    readonly source: RuleSource = 'kiro';

    readonly filePatterns = [
        '.kiro/steering/*.md',
        'AGENTS.md',
    ];

    parse(filePath: string, content: string): UnifiedRule[] {
        if (filePath.includes('.kiro/steering/')) {
            return this.parseSteeringRule(filePath, content);
        }
        if (filePath.endsWith('AGENTS.md')) {
            return this.parseAgentsMd(filePath, content);
        }
        return [];
    }

    generate(rules: UnifiedRule[]): { filePath: string; content: string }[] {
        return rules.map((rule, i) => {
            const fm: Record<string, unknown> = {};
            if (rule.description) fm.description = rule.description;

            const fileName = rule.id
                .replace(/^kiro:/, '')
                .replace(/[^a-zA-Z0-9-_]/g, '-')
                || `rule-${i}`;

            const body = Object.keys(fm).length > 0
                ? matter.stringify(rule.content, fm)
                : rule.content;

            return {
                filePath: `.kiro/steering/${fileName}.md`,
                content: body,
            };
        });
    }

    private parseSteeringRule(filePath: string, content: string): UnifiedRule[] {
        const { data, content: body } = matter(content);
        const trimmed = body.trim();
        if (!trimmed) return [];

        // Kiro steering rules can be "always", "conditional", or "manual"
        const trigger = data.trigger as string | undefined;
        const alwaysApply = !trigger || trigger === 'always';

        return [{
            id: generateRuleId('kiro', filePath),
            content: trimmed,
            description: data.description as string | undefined,
            source: 'kiro',
            scope: alwaysApply ? 'global' : 'path-specific',
            paths: data.globs as string[] | undefined,
            alwaysApply,
            priority: alwaysApply ? 10 : 5,
            hash: hashContent(trimmed),
        }];
    }

    private parseAgentsMd(filePath: string, content: string): UnifiedRule[] {
        const trimmed = content.trim();
        if (!trimmed) return [];

        return [{
            id: generateRuleId('kiro', filePath),
            content: trimmed,
            source: 'kiro',
            scope: 'project',
            alwaysApply: true,
            priority: 10,
            hash: hashContent(trimmed),
        }];
    }
}
