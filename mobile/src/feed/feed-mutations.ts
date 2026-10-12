import type { FeedPost } from '@/api/types';

type Change = { patch: Partial<FeedPost>; fields: Map<keyof FeedPost, number>; deletedAt?: number };

/** Overlay only fields changed after a fetch began; unrelated actions compose. */
export class FeedMutations {
  version = 0;
  private changes = new Map<number, Change>();

  record(id: number, patch: Partial<FeedPost> | null) {
    const version = ++this.version;
    const change: Change = this.changes.get(id) ?? { patch: {}, fields: new Map() };
    if (patch === null) change.deletedAt = version;
    else {
      change.patch = { ...change.patch, ...patch };
      for (const key of Object.keys(patch) as (keyof FeedPost)[]) change.fields.set(key, version);
    }
    this.changes.set(id, change);
    return version;
  }

  apply(post: FeedPost, since: number): FeedPost | null {
    const change = this.changes.get(post.id);
    if (!change) return post;
    if (change.deletedAt && change.deletedAt > since) return null;
    const patch = Object.fromEntries(Object.entries(change.patch).filter(([key]) =>
      (change.fields.get(key as keyof FeedPost) ?? 0) > since,
    ));
    return { ...post, ...patch };
  }
}
