"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  Folder,
  Hash,
  Plus,
  Pencil,
  Trash2,
  FolderPlus,
} from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useFilters } from "@/components/FilterContext";
import type { CollectionNode } from "@/app/api/collections/route";
import {
  CollectionFormDialog,
  type CollectionFormResult,
  type CollectionFormMode,
} from "@/components/CollectionFormDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

/** Pages that render the global FilterBar can apply a collection in place. */
const FILTERED_PATHS = ["/", "/videos"];

export function CollectionTree() {
  const { data, loading, reload } = useApi<{ data: CollectionNode[] }>(
    "/api/collections"
  );
  const { collectionId, setCollection } = useFilters();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [formMode, setFormMode] = useState<CollectionFormMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionNode | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleSelect(node: CollectionNode) {
    setCollection(node.id, node.name);
    // Stay in place when the current page understands the collection filter;
    // only pages without the filter bar need a redirect.
    if (!FILTERED_PATHS.some((path) => pathname === path || (path !== "/" && pathname.startsWith(path)))) {
      router.push("/");
    }
  }

  async function handleDelete(node: CollectionNode) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/collections/${node.id}`, { method: "DELETE" });
      if (res.ok) {
        if (collectionId && collectionContains(node, collectionId)) {
          setCollection(null, null);
        }
        toast.push(`Deleted collection "${node.name}".`, "success");
        reload();
      } else {
        const j = await res.json().catch(() => ({}));
        toast.push(j.error || "Failed to delete collection", "error");
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const roots = useMemo(() => data?.data ?? [], [data?.data]);
  const filtered = useMemo(
    () => filterCollections(roots, search),
    [roots, search]
  );
  const searchActive = search.trim().length > 0;

  function handleFormDone(collection: CollectionFormResult) {
    if (collectionId === collection.id) {
      setCollection(collection.id, collection.name);
    }
    reload();
  }

  return (
    <div className="px-1">
      <div className="mb-1 flex items-center gap-1 px-1">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Collection"
          className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs outline-none focus:border-brand-400"
        />
        <button
          onClick={() => setFormMode({ type: "create-root" })}
          title="New collection"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-brand-700"
        >
          <Plus size={15} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2 px-1 py-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-5 w-full" />
          ))}
        </div>
      ) : (
        <div>
          {filtered.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              searchActive={searchActive}
              onNewChild={(n) =>
                setFormMode({
                  type: "create-child",
                  parentId: n.id,
                  parentName: n.name,
                })
              }
              onRename={(n) =>
                setFormMode({ type: "rename", id: n.id, name: n.name })
              }
              onDelete={(n) => setDeleteTarget(n)}
              onSelect={handleSelect}
            />
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-2 text-xs text-gray-500">No collections</div>
          )}
        </div>
      )}

      <CollectionFormDialog
        mode={formMode}
        onClose={() => setFormMode(null)}
        onDone={handleFormDone}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete collection?"
        message={`Delete "${deleteTarget?.name ?? ""}"${
          deleteTarget?.children.length ? " and its sub-collections" : ""
        }? Videos stay tracked — only the grouping is removed.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

interface RowProps {
  node: CollectionNode;
  depth: number;
  searchActive: boolean;
  onNewChild: (n: CollectionNode) => void;
  onRename: (n: CollectionNode) => void;
  onDelete: (n: CollectionNode) => void;
  onSelect: (n: CollectionNode) => void;
}

function TreeRow(props: RowProps) {
  const { node, depth, searchActive } = props;
  const [open, setOpen] = useState(false);
  const { collectionId } = useFilters();
  const hasChildren = node.children.length > 0;
  const selected = collectionId === node.id;
  const childrenOpen = open || searchActive;

  return (
    <div>
      <div
        className={`group relative flex items-center gap-1 rounded-md py-1 pr-1 text-sm ${
          selected ? "bg-brand-50 text-brand-700" : "hover:bg-gray-100"
        }`}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className={`flex h-4 w-4 items-center justify-center rounded ${
            hasChildren ? "text-gray-400" : "invisible"
          }`}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronRight
            size={14}
            className={`transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>
        <button
          onClick={() => props.onSelect(node)}
          onDoubleClick={(e) => {
            e.preventDefault();
            props.onRename(node);
          }}
          title="Double-click to rename"
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
        >
          {depth === 0 ? (
            <Folder size={14} className="shrink-0 text-gray-400" />
          ) : (
            <Hash size={13} className="shrink-0 text-gray-300" />
          )}
          <span className="truncate">{node.name}</span>
          <span
            title={`${node.videoCount} tracked video${node.videoCount === 1 ? "" : "s"}`}
            className="ml-auto shrink-0 pl-1 text-[11px] text-gray-500"
          >
            {node.videoCount}
          </span>
        </button>
        <div
          className={`flex shrink-0 items-center gap-0.5 ${
            selected ? "opacity-100" : "opacity-60 group-hover:opacity-100"
          }`}
        >
          <RowAction
            label="New sub-collection"
            onClick={() => {
              setOpen(true);
              props.onNewChild(node);
            }}
          >
            <FolderPlus size={13} />
          </RowAction>
          <RowAction label="Rename collection" onClick={() => props.onRename(node)}>
            <Pencil size={13} />
          </RowAction>
          <RowAction
            label="Delete collection"
            danger
            onClick={() => props.onDelete(node)}
          >
            <Trash2 size={13} />
          </RowAction>
        </div>
      </div>
      {childrenOpen &&
        node.children.map((child) => (
          <TreeRow key={child.id} {...props} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

function filterCollections(nodes: CollectionNode[], query: string): CollectionNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;

  return nodes.flatMap((node) => {
    const children = filterCollections(node.children, query);
    const matches = node.name.toLowerCase().includes(needle);
    if (!matches && children.length === 0) return [];
    return [{ ...node, children }];
  });
}

function collectionContains(node: CollectionNode, id: string): boolean {
  return node.id === id || node.children.some((child) => collectionContains(child, id));
}

function RowAction({
  children,
  label,
  onClick,
  danger,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className={`flex h-6 w-6 items-center justify-center rounded hover:bg-gray-200 ${
        danger ? "text-rose-500 hover:text-rose-700" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
