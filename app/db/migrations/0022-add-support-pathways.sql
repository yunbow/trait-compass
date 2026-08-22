-- migration 0022: ライフステージ×目的別の想定ルート機能のため support_pathways / support_pathway_steps を追加する。
-- 1つの調査データ上のルート(lifestagesは配列)は、対象ライフステージごとに1行へ展開して support_pathways
-- に持つ(municipality/lifestage/purpose_id で一意に引けるようにするため)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0022-add-support-pathways.sql (本番は --remote)

CREATE TABLE IF NOT EXISTS support_pathways (
  id TEXT PRIMARY KEY,
  municipality TEXT NOT NULL,
  lifestage TEXT NOT NULL CHECK (lifestage IN ('preschool','elementary-junior-high','high-school','university-vocational','working-adult')),
  purpose_id TEXT NOT NULL,
  purpose_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','unconfirmed','phone_required')),
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_support_pathways_lookup ON support_pathways(municipality, lifestage, purpose_id);

CREATE TABLE IF NOT EXISTS support_pathway_steps (
  id TEXT PRIMARY KEY,
  pathway_id TEXT NOT NULL REFERENCES support_pathways(id),
  step_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  actor TEXT,
  contact TEXT,
  is_conditional INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  sources_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_support_pathway_steps_pathway_id ON support_pathway_steps(pathway_id);
