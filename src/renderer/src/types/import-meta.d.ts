// Vite's import.meta.glob, the one form the renderer uses (eager raw imports).
interface ImportMeta {
  glob<T = unknown>(pattern: string, options: { query?: string; import?: string; eager: true }): Record<string, T>
}
