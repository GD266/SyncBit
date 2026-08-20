export function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatTitle(name: string, version: string): string {
  return `${name} v${version}`;
}
