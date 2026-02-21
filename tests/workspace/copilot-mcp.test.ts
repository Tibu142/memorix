/**
 * Copilot MCP Adapter Tests
 */
import { describe, it, expect } from 'vitest';
import { CopilotMCPAdapter } from '../../src/workspace/mcp-adapters/copilot.js';

const adapter = new CopilotMCPAdapter();

describe('CopilotMCPAdapter', () => {
    describe('parse', () => {
        it('should parse settings.json mcp.servers format', () => {
            const config = JSON.stringify({
                'editor.fontSize': 14,
                mcp: {
                    servers: {
                        memorix: { command: 'npx', args: ['-y', 'memorix', 'serve'] },
                    },
                },
            });
            const servers = adapter.parse(config);
            expect(servers).toHaveLength(1);
            expect(servers[0].name).toBe('memorix');
            expect(servers[0].command).toBe('npx');
        });

        it('should parse env and url', () => {
            const config = JSON.stringify({
                mcp: {
                    servers: {
                        svc: { command: 'node', args: [], env: { KEY: 'val' }, url: 'http://x.com' },
                    },
                },
            });
            const servers = adapter.parse(config);
            expect(servers[0].env).toEqual({ KEY: 'val' });
            expect(servers[0].url).toBe('http://x.com');
        });

        it('should return empty for settings without mcp key', () => {
            const config = JSON.stringify({ 'editor.fontSize': 14 });
            expect(adapter.parse(config)).toEqual([]);
        });

        it('should return empty for invalid JSON', () => {
            expect(adapter.parse('not json')).toEqual([]);
        });
    });

    describe('generate', () => {
        it('should generate mcp.servers format', () => {
            const output = adapter.generate([
                { name: 'test', command: 'npx', args: ['-y', 'test'] },
            ]);
            const parsed = JSON.parse(output);
            // Should be under mcp.servers (Copilot settings format)
            expect(parsed.mcp.servers.test).toBeDefined();
            expect(parsed.mcp.servers.test.command).toBe('npx');
        });
    });

    describe('getConfigPath', () => {
        it('should return platform-specific VSCode settings path', () => {
            const p = adapter.getConfigPath();
            expect(p).toContain('settings.json');
        });
    });

    describe('round-trip', () => {
        it('should survive parse → generate → parse', () => {
            const config = JSON.stringify({
                mcp: {
                    servers: {
                        svc: { command: 'node', args: ['srv.js'], env: { PORT: '3000' } },
                    },
                },
            });
            const servers = adapter.parse(config);
            const generated = adapter.generate(servers);
            const reparsed = adapter.parse(generated);
            expect(reparsed[0].name).toBe('svc');
            expect(reparsed[0].command).toBe('node');
            expect(reparsed[0].env).toEqual({ PORT: '3000' });
        });
    });
});
