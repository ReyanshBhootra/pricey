import Link from "next/link";
import { createPostAction } from "@/lib/actions";
import { getForumPosts } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { BOROUGHS, type Borough } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ForumPage({ searchParams }: PageProps<"/forum">) {
  const sp = await searchParams;
  const borough: Borough = BOROUGHS.includes(sp.borough as Borough) ? (sp.borough as Borough) : "Manhattan";
  const posts = await getForumPosts(borough);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Forum</h1>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
        {BOROUGHS.map((b) => (
          <Link
            key={b}
            href={`/forum?borough=${encodeURIComponent(b)}`}
            className={`shrink-0 rounded-full border px-3 py-1 ${b === borough ? "border-foreground bg-foreground text-background" : "border-line bg-card"}`}
          >
            {b}
          </Link>
        ))}
      </div>

      <form action={createPostAction} className="mb-5 rounded-xl border border-line bg-card p-3">
        <input type="hidden" name="borough" value={borough} />
        <textarea
          name="text"
          required
          maxLength={500}
          rows={3}
          placeholder={`Share a deal or ask something in ${borough}`}
          className="w-full resize-none rounded-lg border border-line bg-background p-2.5 text-sm"
        />
        <div className="mt-2 flex justify-end">
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white dark:text-black">Post</button>
        </div>
      </form>

      {posts.length === 0 ? (
        <p className="text-center text-sm text-muted">No posts in {borough} yet.</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="rounded-xl border border-line bg-card p-4">
              <p className="text-sm whitespace-pre-wrap">{p.text}</p>
              <p className="mt-2 text-xs text-muted">{timeAgo(p.timestamp)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
