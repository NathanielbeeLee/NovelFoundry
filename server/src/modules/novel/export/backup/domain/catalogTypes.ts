export interface BackupField { type: string; nullable?: boolean; default?: boolean; unique?: boolean }
export interface BackupModel { fields: Record<string, BackupField>; refs: Record<string, string> }
