"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type DecisionTree } from "@/lib/api";
import {
  ArrowLeft,
  Loader2,
  Check,
  Plus,
  Play,
  Code,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TreeNode = {
  id: string;
  type: "entry" | "question_block" | "exit";
  config: Record<string, unknown>;
  branches: Array<{ condition: string; next: string }>;
  next?: string;
};

const DEFAULT_TREE = {
  nodes: [
    { id: "entry", type: "entry", config: {}, branches: [], next: "exit" },
    { id: "exit", type: "exit", config: {}, branches: [], next: null },
  ],
};

function generateId(): string {
  return `n${Date.now().toString(36)}`;
}

export default function DecisionTreeEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [tree, setTree] = useState<DecisionTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [previewState, setPreviewState] = useState<{
    current_node: string | null;
    path_taken: string[];
    node_scores: Record<string, number>;
  } | null>(null);
  const [previewScore, setPreviewScore] = useState<string>("7");

  const treeData = (tree?.tree_data as { nodes?: TreeNode[] }) || DEFAULT_TREE;
  const nodes = treeData.nodes || [];

  const loadTree = useCallback(async () => {
    if (!id) return;
    try {
      const t = await api.getDecisionTree(id);
      setTree(t);
      setJsonText(JSON.stringify(t.tree_data || DEFAULT_TREE, null, 2));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tree");
      router.push("/dashboard/decision-trees");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  async function handleSave() {
    if (!tree) return;
    setSaving(true);
    try {
      let data = tree.tree_data;
      if (showJson) {
        try {
          data = JSON.parse(jsonText) as Record<string, unknown>;
        } catch {
          toast.error("Invalid JSON");
          setSaving(false);
          return;
        }
      }
      await api.updateDecisionTree(id, { tree_data: data });
      setTree({ ...tree, tree_data: data });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleValidate() {
    const data = showJson
      ? (() => {
          try {
            return JSON.parse(jsonText) as Record<string, unknown>;
          } catch {
            toast.error("Invalid JSON");
            return null;
          }
        })()
      : tree?.tree_data;
    if (!data) return;
    try {
      const result = await api.validateDecisionTree({ tree_data: data });
      if (result.valid) {
        toast.success("Tree is valid");
      } else {
        toast.error(result.errors?.join("; ") || "Validation failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed");
    }
  }

  async function handlePublish() {
    if (!tree) return;
    try {
      const updated = await api.publishDecisionTree(id);
      setTree(updated);
      toast.success(updated.is_published ? "Published" : "Unpublished");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  }

  function addQuestionBlock() {
    const newId = generateId();
    const entry = nodes.find((n) => n.type === "entry");
    const exit = nodes.find((n) => n.type === "exit");
    const newNodes = [
      ...nodes.filter((n) => n.type !== "entry" && n.type !== "exit"),
      {
        id: newId,
        type: "question_block" as const,
        config: { topic: "New Topic", num_questions: 3, difficulty: "medium" },
        branches: [{ condition: "always", next: exit?.id || "exit" }],
      },
    ];
    const entryNode = entry
      ? { ...entry, next: newId }
      : { id: "entry", type: "entry" as const, config: {}, branches: [], next: newId };
    const exitNode = exit || { id: "exit", type: "exit" as const, config: {}, branches: [], next: null };
    const updated = {
      nodes: [entryNode, ...newNodes, exitNode],
    };
    setTree((t) => (t ? { ...t, tree_data: updated } : null));
    setJsonText(JSON.stringify(updated, null, 2));
  }

  function updateNode(nodeId: string, updates: Partial<TreeNode>) {
    const updated = {
      nodes: nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
    };
    setTree((t) => (t ? { ...t, tree_data: updated } : null));
    setJsonText(JSON.stringify(updated, null, 2));
  }

  function startPreview() {
    const entry = nodes.find((n) => n.type === "entry");
    const first = entry?.next || null;
    setPreviewState({
      current_node: first,
      path_taken: ["start"],
      node_scores: {},
    });
  }

  function stepPreview() {
    if (!previewState) return;
    const current = nodes.find((n) => n.id === previewState.current_node);
    if (!current || current.type === "exit") {
      setPreviewState(null);
      return;
    }
    const score = parseFloat(previewScore) || 7;
    let nextId: string | null = null;
    if (current.branches?.length) {
      for (const b of current.branches) {
        if (b.condition === "always") {
          nextId = b.next;
          break;
        }
        const parts = b.condition.replace("score", "").trim().split(/\s+/);
        if (parts.length === 2) {
          const [op, val] = [parts[0], parseFloat(parts[1])];
          if (op === ">=" && score >= val) {
            nextId = b.next;
            break;
          }
          if (op === "<=" && score <= val) {
            nextId = b.next;
            break;
          }
          if (op === ">" && score > val) {
            nextId = b.next;
            break;
          }
          if (op === "<" && score < val) {
            nextId = b.next;
            break;
          }
        }
      }
      if (!nextId && current.branches.length) {
        nextId = current.branches[current.branches.length - 1].next;
      }
    } else {
      nextId = current.next || null;
    }
    setPreviewState({
      current_node: nextId,
      path_taken: [...previewState.path_taken, previewState.current_node!],
      node_scores: { ...previewState.node_scores, [previewState.current_node as string]: score },
    });
  }

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  if (loading || !tree) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/decision-trees"
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{tree.name}</h1>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              tree.is_published ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            )}
          >
            {tree.is_published ? "Published" : "Draft"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJson(!showJson)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Code className="h-4 w-4" />
            {showJson ? "Visual" : "JSON"}
          </button>
          <button
            onClick={handleValidate}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Check className="h-4 w-4" />
            Validate
          </button>
          <button
            onClick={handlePublish}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
              tree.is_published
                ? "border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "bg-green-600 text-white hover:bg-green-700"
            )}
          >
            {tree.is_published ? "Unpublish" : "Publish"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Save className="h-4 w-4" />
            Save
          </button>
        </div>
      </div>

      {showJson ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="w-full h-96 font-mono text-sm rounded-lg border border-slate-300 p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            spellCheck={false}
          />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-slate-900">Tree Flow</h2>
              <button
                onClick={addQuestionBlock}
                className="flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                <Plus className="h-4 w-4" />
                Add Node
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 py-4">
              {nodes
                .filter((n) => n.type === "entry")
                .map((n) => (
                  <div key={n.id} className="flex flex-col items-center">
                    <div className="rounded-lg border-2 border-green-500 bg-green-50 px-6 py-3 font-medium text-green-800">
                      Entry
                    </div>
                    <div className="h-4 w-0.5 bg-slate-300" />
                    {n.next && nodeMap[n.next] && (
                      <NodeCard
                        node={nodeMap[n.next]}
                        allNodes={nodes}
                        onUpdate={(updates) => updateNode(n.next!, updates)}
                        nodeMap={nodeMap}
                      />
                    )}
                  </div>
                ))}
              {nodes.filter((n) => n.type === "entry").length === 0 && (
                <p className="text-sm text-slate-500">No entry node. Add nodes via JSON editor.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4 flex items-center gap-2">
              <Play className="h-4 w-4" />
              Preview
            </h2>
            {!previewState ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">
                  Simulate stepping through the tree. Enter a score for the current block to see which branch is taken.
                </p>
                <button
                  onClick={startPreview}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Start Preview
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-slate-700">Block score:</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={previewScore}
                    onChange={(e) => setPreviewScore(e.target.value)}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={stepPreview}
                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Step
                  </button>
                  <button
                    onClick={() => setPreviewState(null)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Reset
                  </button>
                </div>
                <p className="text-sm text-slate-600">
                  Path: {previewState.path_taken.join(" → ")}
                  {previewState.current_node && ` → ${previewState.current_node}`}
                </p>
                {previewState.current_node && (
                  <p className="text-sm text-slate-600">
                    Current: {nodeMap[previewState.current_node]?.type || previewState.current_node}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NodeCard({
  node,
  allNodes,
  onUpdate,
  nodeMap,
}: {
  node: TreeNode;
  allNodes: TreeNode[];
  onUpdate: (u: Partial<TreeNode>) => void;
  nodeMap: Record<string, TreeNode>;
}) {
  const [expanded, setExpanded] = useState(true);
  const isExit = node.type === "exit";

  if (isExit) {
    return (
      <div className="flex flex-col items-center">
        <div className="rounded-lg border-2 border-red-500 bg-red-50 px-6 py-3 font-medium text-red-800">
          Exit
        </div>
      </div>
    );
  }

  const config = node.config || {};
  const topic = (config.topic as string) || "Topic";
  const numQ = (config.num_questions as number) ?? 3;
  const difficulty = (config.difficulty as string) || "medium";

  return (
    <div className="flex flex-col items-center">
      <div className="rounded-lg border-2 border-blue-500 bg-blue-50 px-6 py-4 min-w-[200px]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full"
        >
          <span className="font-medium text-blue-900">{topic}</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {expanded && (
          <div className="mt-2 space-y-2 text-sm text-blue-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={topic}
                onChange={(e) => onUpdate({ config: { ...config, topic: e.target.value } })}
                className="flex-1 rounded border border-blue-200 px-2 py-1 bg-white"
                placeholder="Topic"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={20}
                value={numQ}
                onChange={(e) =>
                  onUpdate({ config: { ...config, num_questions: parseInt(e.target.value) || 3 } })
                }
                className="w-16 rounded border border-blue-200 px-2 py-1 bg-white"
              />
              <select
                value={difficulty}
                onChange={(e) => onUpdate({ config: { ...config, difficulty: e.target.value } })}
                className="rounded border border-blue-200 px-2 py-1 bg-white"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            {node.branches?.length > 0 && (
              <div className="text-xs mt-2">
                Branches:{" "}
                {node.branches.map((b, i) => (
                  <span key={i}>
                    {b.condition} → {b.next}
                    {i < node.branches!.length - 1 ? "; " : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {node.next && nodeMap[node.next] && (
        <>
          <div className="h-4 w-0.5 bg-slate-300" />
          <NodeCard
            node={nodeMap[node.next]}
            allNodes={allNodes}
            onUpdate={() => {
              onUpdate({});
            }}
            nodeMap={nodeMap}
          />
        </>
      )}
      {node.branches?.length ? (
        node.branches.map((b, i) =>
          b.next && nodeMap[b.next] ? (
            <div key={i} className="mt-2 flex flex-col items-center">
              <div className="text-xs text-slate-500">({b.condition})</div>
              <div className="h-4 w-0.5 bg-slate-300" />
              <NodeCard
                node={nodeMap[b.next]}
                allNodes={allNodes}
onUpdate={() => {
              const target = allNodes.find((n) => n.id === b.next);
              if (target) onUpdate({});
            }}
                nodeMap={nodeMap}
              />
            </div>
          ) : null
        )
      ) : null}
    </div>
  );
}
