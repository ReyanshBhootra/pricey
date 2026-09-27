import Link from "next/link";
import { chipClass } from "@/components/chip";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { LoginGate } from "@/components/login-gate";
import { createPostAction } from "@/lib/actions";
import { sessionUserId } from "@/lib/session";
import { getForumPosts } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { BOROUGHS, type Borough } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ForumPage({ searchParams }: PageProps<"/forum">) {
  const sp = await searchParams;
  const borough: Borough = BOROUGHS.includes(sp.borough as Borough) ? (sp.borough as Borough) : "Manhattan";
  const [posts, account] = await Promise.all([getForumPosts(borough), sessionUserId()]);

  return (
    <>
      <LiveRefresh name="forumPosts" field="borough" value={borough} />
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Forum</h1>
      <p className="mb-4 text-sm text-muted-foreground">Deals, tips, and questions from your borough.</p>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {BOROUGHS.map((b) => (
          <Link key={b} href={`/forum?borough=${encodeURIComponent(b)}`} className={chipClass(b === borough)} scroll={false}>
            {b}
          </Link>
        ))}
      </div>

      {!account ? (
        <LoginGate action="post in the forum" next={`/forum?borough=${encodeURIComponent(borough)}`} />
      ) : (
      <form action={createPostAction} className="mb-5 rounded-xl border bg-card p-3 shadow-xs">
        <input type="hidden" name="borough" value={borough} />
        <Textarea name="text" required maxLength={500} rows={3} placeholder={`Share a deal or ask something in ${borough}`} className="resize-none" />
        <div className="mt-2 flex justify-end">
          <Button>Post</Button>
        </div>
      </form>
      )}

      {posts.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">No posts in {borough} yet. Start the conversation.</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id}>
              <Card className="gap-2 px-4 py-3">
                <p className="text-sm whitespace-pre-wrap">{p.text}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(p.timestamp)}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
