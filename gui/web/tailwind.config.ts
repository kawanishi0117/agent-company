import type { Config } from 'tailwindcss';

/**
 * Tailwind CSS設定
 * AgentCompany GUIダッシュボード用
 * ダークテーマをベースとしたデザインシステム
 */
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Background colors
        'bg-primary': '#0f172a', // slate-900
        'bg-secondary': '#1e293b', // slate-800
        'bg-tertiary': '#334155', // slate-700
        // Text colors
        'text-primary': '#f8fafc', // slate-50
        'text-secondary': '#94a3b8', // slate-400
        'text-muted': '#64748b', // slate-500
        // Accent colors
        'accent-primary': '#3b82f6', // blue-500
        'accent-hover': '#2563eb', // blue-600
        // Status colors
        'status-pass': '#22c55e', // green-500
        'status-fail': '#ef4444', // red-500
        'status-waiver': '#eab308', // yellow-500
        'status-running': '#3b82f6', // blue-500
      },
    },
  },
  plugins: [],
};

export default config;
