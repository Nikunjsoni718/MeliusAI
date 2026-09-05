"""SQLAlchemy mappings for the Supabase-managed tracking schema.

Apply the SQL migration, not metadata.create_all(): RLS and transactional RPCs
are part of the schema contract. Parent table declarations are FK references only.
"""
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, Column, ForeignKey, Index, Table, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


for _parent in ("project_folders", "profiles"):
    Table(_parent, Base.metadata, Column("id", PGUUID(as_uuid=True), primary_key=True), schema="public", info={"external": True})


class WorkspaceRepositoryState(Base):
    __tablename__ = "workspace_repository_states"
    __table_args__ = (
        CheckConstraint("repository = lower(repository) and repository ~ '^[a-z0-9_.-]+/[a-z0-9_.-]+$'"),
        CheckConstraint("length(btrim(branch)) > 0"),
        CheckConstraint("last_verified_commit_sha ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'"),
        CheckConstraint("baseline_version >= 0"), {"schema": "public"},
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("public.project_folders.id", ondelete="CASCADE"), unique=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("public.profiles.id", ondelete="CASCADE"))
    repository: Mapped[str] = mapped_column(Text)
    branch: Mapped[str] = mapped_column(Text)
    last_verified_commit_sha: Mapped[str] = mapped_column(Text)
    baseline_version: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    previous_verified_report: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    initialized_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=text("now()"))
    verified_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=text("now()"))


class WorkspaceDiff(Base):
    __tablename__ = "workspace_diffs"
    __table_args__ = (
        UniqueConstraint("repository_state_id", "baseline_version", "base_sha", "head_sha"),
        CheckConstraint("baseline_version >= 0"),
        CheckConstraint("base_sha ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'"),
        CheckConstraint("head_sha ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'"),
        CheckConstraint("audit_kind in ('baseline', 'incremental')"),
        CheckConstraint("total_insertions >= 0"), CheckConstraint("total_deletions >= 0"),
        CheckConstraint("jsonb_typeof(files) = 'array'"),
        CheckConstraint("status in ('pending', 'verified', 'failed')"),
        Index("workspace_diffs_history_idx", "repository_state_id", text("created_at desc")),
        {"schema": "public"},
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    repository_state_id: Mapped[UUID] = mapped_column(ForeignKey("public.workspace_repository_states.id", ondelete="CASCADE"))
    baseline_version: Mapped[int] = mapped_column(BigInteger)
    base_sha: Mapped[str] = mapped_column(Text)
    head_sha: Mapped[str] = mapped_column(Text)
    audit_kind: Mapped[str] = mapped_column(Text)
    total_insertions: Mapped[int] = mapped_column(BigInteger)
    total_deletions: Mapped[int] = mapped_column(BigInteger)
    files: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    audit_report: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error_code: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=text("now()"))
    verified_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
