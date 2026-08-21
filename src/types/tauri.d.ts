interface Window {
  __TAURI_INTERNALS__: {
    invoke<T>(cmd: string, args?: Record<string, unknown>, options?: unknown): Promise<T>;
    transformCallback(callback?: (response: unknown) => void, once?: boolean): number;
    unregisterCallback(id: number): void;
    convertFileSrc(filePath: string, protocol?: string): string;
  };
}