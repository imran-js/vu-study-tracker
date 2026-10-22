// Link-only in v1. Future Picker adapters return this metadata to the same
// resource action; they do not access course tracking or its repository.
export interface SelectedDriveFile {
  title: string;
  url: string;
  providerFileId?: string;
}
export interface DriveSelectionAdapter {
  selectFiles(): Promise<SelectedDriveFile[]>;
}
export function driveFileId(url: string): string | undefined {
  try {
    const u = new URL(url);
    return (
      u.pathname.match(/\/(?:d|folders)\/([\w-]+)/)?.[1] ||
      u.searchParams.get("id") ||
      undefined
    );
  } catch {
    return undefined;
  }
}
