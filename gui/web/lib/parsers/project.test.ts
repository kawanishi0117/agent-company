/**
 * @file プロジェクトバリデーションのユニットテスト
 * @description プロジェクトフォームのバリデーションロジックをテストする
 * @requirements 6.5, 6.6 - フォームバリデーションとエラー表示
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// =============================================================================
// バリデーション関数（ProjectFormから抽出）
// =============================================================================

/**
 * Git URLの検証
 */
function isValidGitUrl(url: string): boolean {
  const httpsPattern = /^https:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/;
  const sshPattern = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/;
  return httpsPattern.test(url) || sshPattern.test(url);
}

/**
 * ブランチ名の検証
 */
function isValidBranchName(branch: string): boolean {
  const pattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
  return pattern.test(branch) && !branch.includes('..');
}

/**
 * プロジェクト名の検証
 */
function isValidProjectName(name: string): { valid: boolean; error?: string } {
  if (!name.trim()) {
    return { valid: false, error: 'プロジェクト名は必須です' };
  }
  if (name.length < 2) {
    return { valid: false, error: 'プロジェクト名は2文字以上で入力してください' };
  }
  if (name.length > 50) {
    return { valid: false, error: 'プロジェクト名は50文字以内で入力してください' };
  }
  return { valid: true };
}

// =============================================================================
// Git URL バリデーションのテスト
// =============================================================================

describe('isValidGitUrl', () => {
  describe('正常系 - HTTPS形式', () => {
    it('標準的なGitHub URLを受け入れる', () => {
      expect(isValidGitUrl('https://github.com/user/repo.git')).toBe(true);
    });

    it('.gitなしのURLを受け入れる', () => {
      expect(isValidGitUrl('https://github.com/user/repo')).toBe(true);
    });

    it('GitLab URLを受け入れる', () => {
      expect(isValidGitUrl('https://gitlab.com/user/project.git')).toBe(true);
    });

    it('Bitbucket URLを受け入れる', () => {
      expect(isValidGitUrl('https://bitbucket.org/user/repo.git')).toBe(true);
    });

    it('ハイフンやアンダースコアを含むリポジトリ名を受け入れる', () => {
      expect(isValidGitUrl('https://github.com/user/my-awesome_repo.git')).toBe(true);
    });
  });

  describe('正常系 - SSH形式', () => {
    it('標準的なSSH URLを受け入れる', () => {
      expect(isValidGitUrl('git@github.com:user/repo.git')).toBe(true);
    });

    it('.gitなしのSSH URLを受け入れる', () => {
      expect(isValidGitUrl('git@github.com:user/repo')).toBe(true);
    });

    it('GitLab SSH URLを受け入れる', () => {
      expect(isValidGitUrl('git@gitlab.com:user/project.git')).toBe(true);
    });
  });

  describe('異常系', () => {
    it('空文字列を拒否する', () => {
      expect(isValidGitUrl('')).toBe(false);
    });

    it('HTTP（非HTTPS）を拒否する', () => {
      expect(isValidGitUrl('http://github.com/user/repo.git')).toBe(false);
    });

    it('不正な形式を拒否する', () => {
      expect(isValidGitUrl('github.com/user/repo')).toBe(false);
    });

    it('ローカルパスを拒否する', () => {
      expect(isValidGitUrl('/path/to/repo')).toBe(false);
    });

    it('file://プロトコルを拒否する', () => {
      expect(isValidGitUrl('file:///path/to/repo')).toBe(false);
    });
  });
});

// =============================================================================
// ブランチ名バリデーションのテスト
// =============================================================================

describe('isValidBranchName', () => {
  describe('正常系', () => {
    it('mainを受け入れる', () => {
      expect(isValidBranchName('main')).toBe(true);
    });

    it('developを受け入れる', () => {
      expect(isValidBranchName('develop')).toBe(true);
    });

    it('feature/xxx形式を受け入れる', () => {
      expect(isValidBranchName('feature/new-feature')).toBe(true);
    });

    it('agent/xxx形式を受け入れる', () => {
      expect(isValidBranchName('agent/project-123')).toBe(true);
    });

    it('ドットを含むブランチ名を受け入れる', () => {
      expect(isValidBranchName('release/v1.0.0')).toBe(true);
    });

    it('アンダースコアを含むブランチ名を受け入れる', () => {
      expect(isValidBranchName('feature/my_feature')).toBe(true);
    });

    it('単一文字のブランチ名を受け入れる', () => {
      expect(isValidBranchName('a')).toBe(true);
    });
  });

  describe('異常系', () => {
    it('空文字列を拒否する', () => {
      expect(isValidBranchName('')).toBe(false);
    });

    it('連続するドット(..)を拒否する', () => {
      expect(isValidBranchName('feature..test')).toBe(false);
    });

    it('スラッシュで始まるブランチ名を拒否する', () => {
      expect(isValidBranchName('/feature')).toBe(false);
    });

    it('スラッシュで終わるブランチ名を拒否する', () => {
      expect(isValidBranchName('feature/')).toBe(false);
    });

    it('ハイフンで始まるブランチ名を拒否する', () => {
      expect(isValidBranchName('-feature')).toBe(false);
    });

    it('ドットで始まるブランチ名を拒否する', () => {
      expect(isValidBranchName('.feature')).toBe(false);
    });
  });
});

// =============================================================================
// プロジェクト名バリデーションのテスト
// =============================================================================

describe('isValidProjectName', () => {
  describe('正常系', () => {
    it('有効なプロジェクト名を受け入れる', () => {
      const result = isValidProjectName('My Project');
      expect(result.valid).toBe(true);
    });

    it('2文字のプロジェクト名を受け入れる', () => {
      const result = isValidProjectName('AB');
      expect(result.valid).toBe(true);
    });

    it('50文字のプロジェクト名を受け入れる', () => {
      const result = isValidProjectName('A'.repeat(50));
      expect(result.valid).toBe(true);
    });
  });

  describe('異常系', () => {
    it('空文字列を拒否する', () => {
      const result = isValidProjectName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('プロジェクト名は必須です');
    });

    it('空白のみを拒否する', () => {
      const result = isValidProjectName('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('プロジェクト名は必須です');
    });

    it('1文字のプロジェクト名を拒否する', () => {
      const result = isValidProjectName('A');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('プロジェクト名は2文字以上で入力してください');
    });

    it('51文字以上のプロジェクト名を拒否する', () => {
      const result = isValidProjectName('A'.repeat(51));
      expect(result.valid).toBe(false);
      expect(result.error).toBe('プロジェクト名は50文字以内で入力してください');
    });
  });
});

// =============================================================================
// プロパティベーステスト
// =============================================================================

describe('Property-based tests', () => {
  /**
   * Property 12: Form Validation Behavior
   * 無効な入力に対してフォームは送信を拒否し、明確なエラーメッセージを表示する
   * @validates Requirements 6.5, 6.6
   */
  describe('Property 12: Form Validation Behavior', () => {
    it('有効なHTTPS Git URLは常に受け入れられる', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789.-'.split('')), {
              minLength: 1,
              maxLength: 20,
            }),
            fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._-'.split('')), {
              minLength: 1,
              maxLength: 20,
            }),
            fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._-'.split('')), {
              minLength: 1,
              maxLength: 20,
            }),
            fc.boolean()
          ),
          ([domain, user, repo, withGit]) => {
            const url = `https://${domain}.com/${user}/${repo}${withGit ? '.git' : ''}`;
            // ドメイン、ユーザー、リポジトリが有効な場合のみテスト
            if (domain.length > 0 && user.length > 0 && repo.length > 0) {
              return isValidGitUrl(url) === true;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('有効なブランチ名は常に受け入れられる', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._/-'.split('')), {
            minLength: 1,
            maxLength: 50,
          }),
          (branch) => {
            // 先頭と末尾が英数字で、連続ドットがない場合のみ有効
            const startsWithAlnum = /^[a-zA-Z0-9]/.test(branch);
            const endsWithAlnum = /[a-zA-Z0-9]$/.test(branch);
            const noDoubleDots = !branch.includes('..');

            if (startsWithAlnum && endsWithAlnum && noDoubleDots) {
              return isValidBranchName(branch) === true;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('2-50文字のプロジェクト名は常に有効', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 2, maxLength: 50 }), (name) => {
          // 空白のみでない場合
          if (name.trim().length >= 2) {
            const result = isValidProjectName(name);
            return result.valid === true;
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('1文字以下または51文字以上のプロジェクト名は常に無効', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 0, maxLength: 1 }),
            fc.string({ minLength: 51, maxLength: 100 })
          ),
          (name) => {
            const result = isValidProjectName(name);
            // 空白のみの場合は「必須」エラー、それ以外は長さエラー
            return result.valid === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
