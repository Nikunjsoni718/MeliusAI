export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'talent' | 'recruiter';
export type ProjectStatus = 'draft' | 'submitted' | 'reviewed' | 'archived';
export type ScoreSource = 'gemini' | 'manual';
export type PortfolioSourceKind = 'github' | 'behance' | 'drive' | 'website';

export type UserRow = {
  id: string;
  role: UserRole;
  role_selected_at: string | null;
  display_name: string;
  username: string | null;
  birth_date: string | null;
  headline: string | null;
  bio: string | null;
  avatar_url: string | null;
  github_username: string | null;
  company_name: string | null;
  created_at: string;
  updated_at: string;
};

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
  owner_id?: string | null;
  is_public?: boolean | null;
  name?: string | null;
  title?: string | null;
  folder_id?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_url?: string | null;
  file_size?: number | null;
  description?: string | null;
  user_description?: string | null;
  score?: number | null;
  audit_summary?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  recommendations?: string[] | null;
  evaluation_score?: number | null;
  has_been_audited?: boolean | null;
  logic_score?: number | null;
  ai_summary?: string | null;
  last_improvement_summary?: string | null;
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
  owner_id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ScoreRow = {
  id: string;
  project_id: string;
  scored_by: string | null;
  source: ScoreSource;
  score: number;
  summary: string | null;
  improvement_tips: Json[];
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
      users: {
        Row: UserRow;
        Insert: Partial<Omit<UserRow, 'created_at' | 'updated_at'>> & Pick<UserRow, 'id' | 'role' | 'display_name'>;
        Update: Partial<Omit<UserRow, 'id' | 'created_at' | 'updated_at'>>;
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
        Insert: Partial<Omit<ProjectRow, 'id'>> & Pick<ProjectRow, 'owner_id' | 'title' | 'file_url'>;
        Update: Partial<Omit<ProjectRow, 'id' | 'owner_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      project_folders: {
        Row: ProjectFolderRow;
        Insert: Partial<Omit<ProjectFolderRow, 'id'>> & Pick<ProjectFolderRow, 'name'>;
        Update: Partial<Omit<ProjectFolderRow, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      scores: {
        Row: ScoreRow;
        Insert: Partial<Omit<ScoreRow, 'created_at' | 'updated_at' | 'id'>> & Pick<ScoreRow, 'project_id' | 'score'>;
        Update: Partial<Omit<ScoreRow, 'id' | 'project_id' | 'created_at' | 'updated_at'>>;
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


