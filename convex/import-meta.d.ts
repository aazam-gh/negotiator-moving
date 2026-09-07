interface ImportMeta {
  glob(
    patterns: string | readonly string[],
  ): Record<string, () => Promise<unknown>>;
}
