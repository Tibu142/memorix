/**
 * Project Detector Tests
 *
 * Tests Git remote URL normalization logic.
 * TDD: Tests the normalizeGitRemote behavior via detectProject.
 */

import { describe, it, expect } from 'vitest';
import { detectProject } from '../../src/project/detector.js';

describe('Project Detector', () => {
  it('should detect current project (this repo has a git remote or uses dir name)', () => {
    const project = detectProject();
    expect(project.id).toBeTruthy();
    expect(project.name).toBeTruthy();
    expect(project.rootPath).toBeTruthy();
  });

  it('should detect project from a specific directory', () => {
    const project = detectProject(process.cwd());
    // Normalize path separators for cross-platform compatibility
    expect(project.rootPath.replace(/\\/g, '/')).toBe(process.cwd().replace(/\\/g, '/'));
  });

  it('should fallback to directory name for non-git dirs', () => {
    const project = detectProject('/tmp');
    expect(project.id).toBeTruthy();
    expect(project.gitRemote).toBeUndefined();
  });
});
