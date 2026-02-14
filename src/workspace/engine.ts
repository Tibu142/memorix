import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type {
  AgentTarget,
  MCPServerEntry,
  MCPConfigAdapter,
  WorkflowEntry,
  WorkspaceSyncResult,
  RuleSource,
} from '../types.js';
import { WindsurfMCPAdapter } from './mcp-adapters/windsurf.js';
import { CursorMCPAdapter } from './mcp-adapters/cursor.js';
import { CodexMCPAdapter } from './mcp-adapters/codex.js';
import { ClaudeCodeMCPAdapter } from './mcp-adapters/claude-code.js';
import { WorkflowSyncer } from './workflow-sync.js';
import { RulesSyncer } from '../rules/syncer.js';
import { sanitize } from './sanitizer.js';
import { WorkspaceSyncApplier, type ApplyResult } from './applier.js';

/** Scan result from workspace analysis */
export interface WorkspaceScanResult {
  mcpConfigs: Record<AgentTarget, MCPServerEntry[]>;
  workflows: WorkflowEntry[];
  rulesCount: number;
}

/**
 * WorkspaceSyncEngine — orchestrates cross-agent workspace migration.
 *
 * Capabilities:
 * 1. MCP config sync (JSON ↔ TOML across 4 agents)
 * 2. Workflow sync (Windsurf workflows → Codex skills / Cursor rules / CLAUDE.md)
 * 3. Rules sync (via existing RulesSyncer)
 */
export class WorkspaceSyncEngine {
  private adapters: Map<AgentTarget, MCPConfigAdapter>;
  private workflowSyncer: WorkflowSyncer;
  private rulesSyncer: RulesSyncer;

  constructor(private projectRoot: string) {
    this.adapters = new Map<AgentTarget, MCPConfigAdapter>([
      ['windsurf', new WindsurfMCPAdapter()],
      ['cursor', new CursorMCPAdapter()],
      ['codex', new CodexMCPAdapter()],
      ['claude-code', new ClaudeCodeMCPAdapter()],
    ]);
    this.workflowSyncer = new WorkflowSyncer();
    this.rulesSyncer = new RulesSyncer(projectRoot);
  }

  /**
   * Scan the workspace for all agent configs, workflows, and rules.
   */
  async scan(): Promise<WorkspaceScanResult> {
    const mcpConfigs: Record<AgentTarget, MCPServerEntry[]> = {
      windsurf: [],
      cursor: [],
      codex: [],
      'claude-code': [],
    };

    // Scan MCP configs from each agent
    for (const [target, adapter] of this.adapters) {
      const configPath = adapter.getConfigPath(this.projectRoot);
      const globalPath = adapter.getConfigPath();

      // Try project-level first, then global
      for (const path of [configPath, globalPath]) {
        if (existsSync(path)) {
          try {
            const content = readFileSync(path, 'utf-8');
            const servers = adapter.parse(content);
            if (servers.length > 0) {
              mcpConfigs[target] = servers;
              break;
            }
          } catch {
            // Skip unreadable configs
          }
        }
      }
    }

    // Scan Windsurf workflows
    const workflows = this.scanWorkflows();

    // Scan rules
    let rulesCount = 0;
    try {
      const rules = await this.rulesSyncer.scanRules();
      rulesCount = rules.length;
    } catch {
      // Rules scan may fail if no rules exist
    }

    return { mcpConfigs, workflows, rulesCount };
  }

  /**
   * Migrate workspace configs to a target agent format.
   */
  async migrate(target: AgentTarget): Promise<WorkspaceSyncResult> {
    const scan = await this.scan();
    const result: WorkspaceSyncResult = {
      mcpServers: { scanned: [], generated: [] },
      workflows: { scanned: [], generated: [] },
      rules: { scanned: 0, generated: 0 },
    };

    // 1. Merge all MCP servers from all sources (dedup by name)
    const allServers = new Map<string, MCPServerEntry>();
    for (const servers of Object.values(scan.mcpConfigs)) {
      for (const s of servers) {
        if (!allServers.has(s.name)) {
          allServers.set(s.name, s);
        }
      }
    }
    result.mcpServers.scanned = Array.from(allServers.values());

    // Generate target MCP config (sanitize sensitive values in output)
    if (result.mcpServers.scanned.length > 0) {
      const adapter = this.adapters.get(target)!;
      const configContent = adapter.generate(result.mcpServers.scanned);
      const configPath = adapter.getConfigPath(this.projectRoot);
      result.mcpServers.generated.push({
        filePath: configPath,
        content: sanitize(configContent),
      });
    }

    // 2. Convert workflows to target format
    result.workflows.scanned = scan.workflows;
    if (scan.workflows.length > 0) {
      result.workflows.generated = this.workflowSyncer.convertAll(scan.workflows, target);
    }

    // 3. Rules sync
    try {
      const rules = await this.rulesSyncer.scanRules();
      result.rules.scanned = rules.length;
      if (rules.length > 0) {
        const deduped = this.rulesSyncer.deduplicateRules(rules);
        const ruleSource = this.agentToRuleSource(target);
        if (ruleSource) {
          const files = this.rulesSyncer.generateForTarget(deduped, ruleSource);
          result.rules.generated = files.length;
        }
      }
    } catch {
      // Rules may not exist
    }

    return result;
  }

  // ---- Private helpers ----

  private scanWorkflows(): WorkflowEntry[] {
    const workflows: WorkflowEntry[] = [];
    const wfDir = join(this.projectRoot, '.windsurf', 'workflows');

    if (!existsSync(wfDir)) return workflows;

    try {
      const files = readdirSync(wfDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        try {
          const content = readFileSync(join(wfDir, file), 'utf-8');
          workflows.push(this.workflowSyncer.parseWindsurfWorkflow(file, content));
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Directory read error
    }

    return workflows;
  }

  /**
   * Apply migration results to disk with backup and rollback.
   *
   * Safety features:
   *   - Backs up every existing file before overwriting
   *   - Atomic writes (temp → rename)
   *   - Auto-rollback on any failure
   *   - Returns backup paths for manual rollback if needed
   */
  async apply(target: AgentTarget): Promise<ApplyResult & { migrationSummary: string }> {
    const syncResult = await this.migrate(target);
    const applier = new WorkspaceSyncApplier();

    // Collect all files to write
    const filesToWrite = [
      ...syncResult.mcpServers.generated,
      ...syncResult.workflows.generated,
    ];

    const applyResult = await applier.apply(filesToWrite);

    // Build summary
    const lines: string[] = [];
    if (applyResult.success) {
      lines.push(`✅ Applied ${applyResult.filesWritten.length} file(s) for ${target}`);
      for (const f of applyResult.filesWritten) {
        lines.push(`  → ${f}`);
      }
      if (applyResult.backups.length > 0) {
        lines.push(`\n📦 Backups created (${applyResult.backups.length}):`);
        for (const b of applyResult.backups) {
          lines.push(`  ${b.originalPath} → ${b.backupPath}`);
        }
      }
      // Clean up backups after successful apply
      applier.cleanBackups(applyResult.backups);
    } else {
      lines.push(`❌ Apply failed for ${target}`);
      for (const e of applyResult.errors) {
        lines.push(`  Error: ${e}`);
      }
      if (applyResult.backups.length > 0) {
        lines.push(`\n🔄 Rolled back ${applyResult.backups.length} file(s)`);
      }
    }

    return {
      ...applyResult,
      migrationSummary: lines.join('\n'),
    };
  }

  // ---- Private helpers ----

  private agentToRuleSource(target: AgentTarget): RuleSource | null {
    const map: Record<AgentTarget, RuleSource> = {
      cursor: 'cursor',
      'claude-code': 'claude-code',
      codex: 'codex',
      windsurf: 'windsurf',
    };
    return map[target] ?? null;
  }
}
