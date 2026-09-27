import Link from "next/link";
import { chipClass } from "@/components/chip";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { MessagesSquare } from "lucide-react";
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
      <h1 className="mb-2 text-[2.6rem] leading-[0.95]">Forum</h1>
      <p className="mb-5 text-muted-foreground">Deals, tips, and questions from your borough.</p>
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
      <form action={createPostAction} className="mb-6 rounded-[1.5rem] border bg-card p-3">
        <input type="hidden" name="borough" value={borough} />
        <Textarea name="text" required maxLength={500} rows={3} placeholder={`Share a deal or ask something in ${borough}`} className="resize-none" />
        <div className="mt-2 flex justify-end">
          <Button>Post to {borough}</Button>
        </div>
      </form>
      )}

      {posts.length === 0 ? (
        <Empty className="rounded-[1.5rem] border-2">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessagesSquare />
            </EmptyMedia>
            <EmptyTitle>No posts in {borough} yet</EmptyTitle>
            <EmptyDescription>Share a deal you spotted or ask where to find something cheap.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-4">
          {posts.map((p) => (
            <li key={p.id} className="max-w-[92%]">
              <p className="rounded-[1.25rem] rounded-bl-md border bg-card px-4 py-3 whitespace-pre-wrap">{p.text}</p>
              <p className="mt-1 ml-3 text-xs text-muted-foreground">A New Yorker, {timeAgo(p.timestamp)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
