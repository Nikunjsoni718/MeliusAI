export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'talent' | 'recruiter';
export type ProjectStatus = 'draft' | 'submitted' | 'reviewed' | 'archived';
export type ScoreSource = 'gemini' | 'manual';
export type PortfolioSourceKind = 'github' | 'behance' | 'drive' | 'website';
export type PendingImportStatus = 'pending' | 'imported' | 'dismissed';

export type ProfileRow = {
  id: string;
  email?: string | null;
  full_name: string | null;
  username: string | null;
  birth_date: string | null;
  bio: string | null;
  skills: string[] | null;
  internal_keywords?: string[] | null;
  extracted_experience?: string[] | null;
  extracted_preferences?: string[] | null;
  avatar_url: string | null;
  age: number | null;
  current_status: string | null;
  education: string | null;
  qualifications: string[] | null;
  avg_project_score: number | null;
  github_user_id?: string | null;
  github_username?: string | null;
  experience: string[] | null;
  hobbies: string[] | null;
  resume_projects?: Json[] | null;
  external_links?: Json[] | null;
  created_at: string;
  updated_at: string;
};

export type ProjectRow = {
  id: string;
  user_id?: string;
  is_public?: boolean | null;
  name?: string | null;
  title?: string | null;
  folder_id?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_url?: string | null;
  storage_path?: string | null;
  file_size?: number | null;
  asset_content?: string | null;
  description?: string | null;
  user_description?: string | null;
  score?: number | null;
  score_delta?: number | null;
  delta_summary?: string | null;
  score_reasoning?: string | null;
  audit_summary?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  recommendations?: string[] | null;
  evaluation_score?: number | null;
  has_been_audited?: boolean | null;
  logic_score?: number | null;
  ai_summary?: string | null;
  last_improved_summary?: string | null;
  previous_score?: number | null;
  last_improvement_summary?: string | null;
  github_repository?: string | null;
  github_file_path?: string | null;
  github_ref?: string | null;
  github_commit_sha?: string | null;
  github_sync_status?: 'untracked' | 'synced' | 'deleted' | 'error' | null;
  github_synced_at?: string | null;
  github_sync_error?: string | null;
  profession?: string | null;
  target_company?: string | null;
  auto_apply_enabled?: boolean | null;
  summary?: string | null;
  stack?: Json[] | null;
  status?: ProjectStatus | null;
  created_at: string;
  updated_at?: string | null;
};

export type ProjectFolderRow = {
  id: string;
  user_id?: string | null;
  name: string;
  score?: number | null;
  evaluation_score?: number | null;
  score_delta?: number | null;
  delta_summary?: string | null;
  executive_summary?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  recommendations?: string[] | null;
  has_been_audited?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AuditSnapshotRow = {
  id: string;
  workspace_id: string;
  commit_sha: string;
  score: number;
  score_delta: number;
  delta_summary: string;
  created_at: string;
};

export type RepositoryFileDiff = {
  filename: string;
  insertions: number;
  deletions: number;
  patch: string | null;
  status: string;
  previous_filename?: string;
  patch_source?: 'github' | 'reconstructed';
  old_sha?: string | null;
  new_sha?: string | null;
  old_mode?: string | null;
  new_mode?: string | null;
  non_text_reason?: 'binary' | 'submodule';
  is_symlink?: boolean;
};

export type WorkspaceRepositoryStateRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  repository: string;
  branch: string;
  last_verified_commit_sha: string;
  baseline_version: number;
  previous_verified_report: Json | null;
  initialized_at: string;
  verified_at: string | null;
  updated_at: string;
};

export type WorkspaceDiffRow = {
  id: string;
  repository_state_id: string;
  baseline_version: number;
  base_sha: string;
  head_sha: string;
  audit_kind: 'baseline' | 'incremental';
  total_insertions: number;
  total_deletions: number;
  files: RepositoryFileDiff[];
  status: 'pending' | 'verified' | 'failed';
  audit_report: Json | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
};

export type PendingImportRow = {
  id: string;
  user_id: string;
  provider: 'github';
  provider_repository_id: string;
  repository_full_name: string;
  repository_name: string;
  html_url: string | null;
  default_branch: string | null;
  is_private: boolean;
  status: PendingImportStatus;
  webhook_delivery_id: string | null;
  repository_payload: Json;
  detected_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobRow = {
  id: string;
  company_name: string;
  role_title: string;
  location: string | null;
  status: string;
  created_at: string;
};

export type UserApplicationRow = {
  id: string;
  user_id: string;
  job_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      workspace_repository_states: {
        Row: WorkspaceRepositoryStateRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      workspace_diffs: {
        Row: WorkspaceDiffRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partial<Omit<ProfileRow, 'id'>> & Pick<ProfileRow, 'id'>;
        Update: Partial<Omit<ProfileRow, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      projects: {
        Row: ProjectRow;
        Insert: Partial<Omit<ProjectRow, 'id'>> & Pick<ProjectRow, 'user_id' | 'title' | 'file_url'>;
        Update: Partial<Omit<ProjectRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      project_folders: {
        Row: ProjectFolderRow;
        Insert: Partial<Omit<ProjectFolderRow, 'id'>> & Pick<ProjectFolderRow, 'name'>;
        Update: Partial<Omit<ProjectFolderRow, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      audit_snapshots: {
        Row: AuditSnapshotRow;
        Insert: Partial<Omit<AuditSnapshotRow, 'id' | 'created_at'>> &
          Pick<AuditSnapshotRow, 'workspace_id' | 'commit_sha' | 'score' | 'score_delta' | 'delta_summary'>;
        Update: Partial<Omit<AuditSnapshotRow, 'id' | 'workspace_id' | 'created_at'>>;
        Relationships: [];
      };
      pending_imports: {
        Row: PendingImportRow;
        Insert: Partial<Omit<PendingImportRow, 'id' | 'created_at' | 'updated_at'>> &
          Pick<PendingImportRow, 'user_id' | 'provider_repository_id' | 'repository_full_name' | 'repository_name'>;
        Update: Partial<
          Omit<PendingImportRow, 'id' | 'user_id' | 'provider' | 'provider_repository_id' | 'created_at' | 'updated_at'>
        >;
        Relationships: [];
      };
      jobs: {
        Row: JobRow;
        Insert: Partial<Omit<JobRow, 'id' | 'created_at'>> & Pick<JobRow, 'company_name' | 'role_title' | 'status'>;
        Update: Partial<Omit<JobRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      user_applications: {
        Row: UserApplicationRow;
        Insert: Partial<Omit<UserApplicationRow, 'id' | 'created_at' | 'updated_at'>> & Pick<UserApplicationRow, 'user_id' | 'job_id' | 'status'>;
        Update: Partial<Omit<UserApplicationRow, 'id' | 'user_id' | 'job_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}


